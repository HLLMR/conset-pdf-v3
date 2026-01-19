#!/usr/bin/env python3
"""
Verify outline item destinations and resolve page indices.

Outputs JSON with resolved page indices for each bookmark.
"""

import sys
import json
import os
import hashlib
from pikepdf import Pdf, Name

def verify_outline_pages(pdf_path):
    """Verify outline destinations and resolve page indices."""
    result = {
        'inputPdf': pdf_path,
        'fileSize': 0,
        'sha256': '',
        'count': 0,
        'items': [],
        'issues': []
    }
    
    try:
        # Get file size and SHA-256 hash
        file_size = os.path.getsize(pdf_path)
        result['fileSize'] = file_size
        
        with open(pdf_path, 'rb') as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
        result['sha256'] = file_hash
        
        pdf = Pdf.open(pdf_path)
        
        if '/Outlines' not in pdf.Root:
            result['issues'].append('PDF has no /Outlines')
            print(json.dumps(result, indent=2))
            return 1
        
        outlines = pdf.Root.Outlines
        
        if '/First' not in outlines:
            result['issues'].append('/Outlines has no /First')
            print(json.dumps(result, indent=2))
            return 1
        
        def resolve_page_index(dest_array):
            """Resolve destination array to 0-based page index."""
            if not (hasattr(dest_array, '__len__') and hasattr(dest_array, '__getitem__')):
                return None
            
            if len(dest_array) == 0:
                return None
            
            # First element should be page reference
            page_ref = dest_array[0]
            
            # Try to resolve to page index
            try:
                # Method 1: Direct object comparison (works for direct references)
                for i, page in enumerate(pdf.pages):
                    try:
                        if page.obj == page_ref:
                            return i
                    except:
                        pass
                
                # Method 2: Compare objgen (object number and generation)
                # This is the most reliable method for indirect references
                if hasattr(page_ref, 'objgen'):
                    page_ref_objgen = page_ref.objgen
                    for i, page in enumerate(pdf.pages):
                        try:
                            if hasattr(page.obj, 'objgen') and page.obj.objgen == page_ref_objgen:
                                return i
                        except:
                            continue
                
                # Method 3: Try accessing objgen via different attribute names
                try:
                    # Some pikepdf versions use different attribute names
                    ref_objgen = getattr(page_ref, 'objgen', None) or getattr(page_ref, '_objgen', None)
                    if ref_objgen:
                        for i, page in enumerate(pdf.pages):
                            try:
                                page_objgen = getattr(page.obj, 'objgen', None) or getattr(page.obj, '_objgen', None)
                                if page_objgen == ref_objgen:
                                    return i
                            except:
                                continue
                except:
                    pass
                
                # Method 4: Try using pikepdf's page lookup
                # If page_ref is an indirect reference, we might be able to resolve it
                try:
                    # Get the object number from the reference
                    if hasattr(page_ref, 'objgen'):
                        obj_num, gen_num = page_ref.objgen
                        # Try to get the object and see if it's a page
                        obj = pdf.get_object(obj_num, gen_num)
                        # Check if this object matches any page
                        for i, page in enumerate(pdf.pages):
                            try:
                                if page.obj == obj or (hasattr(page.obj, 'objgen') and page.obj.objgen == (obj_num, gen_num)):
                                    return i
                            except:
                                continue
                except:
                    pass
                
                return None
            except Exception as e:
                return None
        
        def walk_outline(item, level=0, visited=None, objgen_visited=None):
            """Walk outline tree and collect items with duplicate detection."""
            if item is None:
                return
            
            if visited is None:
                visited = set()
            if objgen_visited is None:
                objgen_visited = set()
            
            # Use objgen (object number, generation) for reliable duplicate detection
            # This is more reliable than id() which can vary
            item_objgen = None
            try:
                if hasattr(item, 'objgen'):
                    item_objgen = item.objgen
                elif hasattr(item, '_objgen'):
                    item_objgen = item._objgen
            except:
                pass
            
            # Check for duplicates using objgen
            if item_objgen:
                if item_objgen in objgen_visited:
                    result['issues'].append(f"Duplicate outline item detected: objgen={item_objgen}")
                    return  # Skip duplicate
                objgen_visited.add(item_objgen)
            
            # Also use Python id as fallback
            item_id = id(item)
            if item_id in visited:
                result['issues'].append(f"Duplicate outline item detected: id={item_id}")
                return  # Skip duplicate
            visited.add(item_id)
            
            # Get title
            try:
                title_bytes = item.get('/Title', b'')
                title = title_bytes.decode('utf-8', errors='replace') if isinstance(title_bytes, bytes) else str(title_bytes)
            except:
                title = f'<error>'
            
            # Get destination
            page_index = None
            view_type = None
            has_a = False
            has_dest = False
            
            # Check /Dest
            if '/Dest' in item:
                has_dest = True
                dest = item.Dest
                page_index = resolve_page_index(dest)
                if hasattr(dest, '__len__') and len(dest) > 1:
                    view_type = str(dest[1])
            
            # Check /A
            if '/A' in item:
                has_a = True
                action = item.A
                if '/D' in action:
                    d_val = action.get('/D') if hasattr(action, 'get') else action['/D']
                    if page_index is None:
                        page_index = resolve_page_index(d_val)
                    if view_type is None and hasattr(d_val, '__len__') and len(d_val) > 1:
                        view_type = str(d_val[1])
            
            # Validate page index
            if page_index is None:
                result['issues'].append(f"Item '{title}' has no resolvable page index")
            elif page_index < 0 or page_index >= len(pdf.pages):
                result['issues'].append(f"Item '{title}' has out-of-bounds page index: {page_index} (PDF has {len(pdf.pages)} pages)")
            
            # Add to result (all levels, not just root)
            result['items'].append({
                'title': title,
                'pageIndex': page_index,
                'pageNumber': page_index + 1 if page_index is not None else None,  # 1-based for human readability
                'view': view_type,
                'hasA': has_a,
                'hasDest': has_dest,
                'level': level
            })
            result['count'] += 1
            
            # Walk children recursively
            if '/First' in item:
                walk_outline(item.First, level + 1, visited, objgen_visited)
            
            # Walk next sibling
            if '/Next' in item:
                walk_outline(item.Next, level, visited, objgen_visited)
        
        # Start walking from first root item (recursive, all levels)
        item = outlines.First
        visited = set()
        objgen_visited = set()
        while item is not None:
            walk_outline(item, 0, visited, objgen_visited)
            if '/Next' in item:
                item = item.Next
            else:
                break
        
        # Report summary
        if len(result['issues']) > 0:
            result['issues'].insert(0, f"Traversed {result['count']} outline item(s)")
        else:
            result['issues'].append(f"Traversed {result['count']} outline item(s) - no duplicates detected")
        
        print(json.dumps(result, indent=2))
        return 0 if len(result['issues']) == 0 else 1
        
    except Exception as e:
        result['issues'].append(f"Error: {e}")
        import traceback
        result['issues'].append(traceback.format_exc())
        print(json.dumps(result, indent=2))
        return 1

def main():
    if len(sys.argv) < 2:
        print("Usage: verify_outline_pages.py <pdf_path>", file=sys.stderr)
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    sys.exit(verify_outline_pages(pdf_path))

if __name__ == '__main__':
    main()
