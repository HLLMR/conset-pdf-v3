#!/usr/bin/env python3
"""
DELETION CANDIDATE: Debug script (not used in production)

Status: Orphaned - debug utility, not imported or called
Evidence:
  - Not imported by any TypeScript/JavaScript code
  - Not referenced in tests
  - Manual debugging script only

Action: Mark for deletion - useful for manual debugging but not part of production code
TODO: Remove after confirming no manual usage
Tracking: Cleanup pass 2026-01-17

Original purpose: Debug script to inspect PDF outline structure and destination references.
Usage: python debug_outline_structure.py <pdf_path> [--limit N]
"""

import sys
import argparse
from pikepdf import Pdf, Name

def inspect_outline_structure(pdf_path, limit=20):
    """Inspect outline items and their destination structure."""
    try:
        pdf = Pdf.open(pdf_path)
        
        if '/Outlines' not in pdf.Root:
            print(f"ERROR: PDF has no /Outlines in Root")
            return 1
        
        outlines = pdf.Root.Outlines
        
        if '/First' not in outlines:
            print(f"ERROR: /Outlines has no /First")
            return 1
        
        print(f"Inspecting outline structure (first {limit} items):")
        print("=" * 80)
        
        item = outlines.First
        count = 0
        
        def inspect_item(item, level=0):
            nonlocal count
            if count >= limit:
                return
            
            indent = "  " * level
            
            # Get title
            try:
                title_bytes = item.get('/Title', b'')
                if isinstance(title_bytes, bytes):
                    title = title_bytes.decode('utf-8', errors='replace')
                else:
                    title = str(title_bytes)
            except Exception as e:
                title = f'<error: {e}>'
            
            # Check for /Dest and /A
            has_dest = '/Dest' in item
            has_action = '/A' in item
            
            print(f"{indent}Item {count + 1}: {title[:60]}")
            print(f"{indent}  Has /Dest: {has_dest}")
            print(f"{indent}  Has /A: {has_action}")
            
            # Inspect /Dest
            if has_dest:
                try:
                    dest = item.Dest
                    if hasattr(dest, '__len__') and hasattr(dest, '__getitem__'):
                        dest_len = len(dest)
                        print(f"{indent}  /Dest array length: {dest_len}")
                        
                        if dest_len > 0:
                            page_ref = dest[0]
                            print(f"{indent}  /Dest[0] type: {type(page_ref)}")
                            
                            # Check if it's an indirect reference
                            is_indirect = hasattr(page_ref, 'objgen') or hasattr(page_ref, '_objgen')
                            if is_indirect:
                                try:
                                    objgen = page_ref.objgen if hasattr(page_ref, 'objgen') else page_ref._objgen
                                    print(f"{indent}  /Dest[0] is INDIRECT: objgen={objgen}")
                                except:
                                    print(f"{indent}  /Dest[0] appears indirect (has objgen attr)")
                            else:
                                # Check if it's a dictionary (inline)
                                is_dict = hasattr(page_ref, 'keys') or isinstance(page_ref, dict)
                                if is_dict:
                                    print(f"{indent}  /Dest[0] is INLINE DICT (NOT indirect - viewer incompatible!)")
                                    try:
                                        dict_keys = list(page_ref.keys()) if hasattr(page_ref, 'keys') else list(page_ref)
                                        print(f"{indent}    Dict keys: {dict_keys}")
                                    except:
                                        pass
                                else:
                                    print(f"{indent}  /Dest[0] type unclear: {type(page_ref)}")
                            
                            if dest_len > 1:
                                view_type = dest[1]
                                print(f"{indent}  /Dest[1] (view type): {view_type} (type: {type(view_type)})")
                except Exception as e:
                    print(f"{indent}  /Dest: <error reading: {e}>")
            
            # Inspect /A (action)
            if has_action:
                try:
                    action = item.A
                    print(f"{indent}  /A type: {type(action)}")
                    if hasattr(action, '__contains__') or isinstance(action, dict):
                        has_s = '/S' in action
                        has_d = '/D' in action
                        print(f"{indent}  /A has /S: {has_s}")
                        print(f"{indent}  /A has /D: {has_d}")
                        
                        if has_s:
                            s_type = action.get('/S') if hasattr(action, 'get') else action['/S']
                            print(f"{indent}  /A /S: {s_type}")
                        
                        if has_d:
                            d_val = action.get('/D') if hasattr(action, 'get') else action['/D']
                            if hasattr(d_val, '__len__') and hasattr(d_val, '__getitem__') and len(d_val) > 0:
                                d_page_ref = d_val[0]
                                is_indirect = hasattr(d_page_ref, 'objgen') or hasattr(d_page_ref, '_objgen')
                                if is_indirect:
                                    try:
                                        objgen = d_page_ref.objgen if hasattr(d_page_ref, 'objgen') else d_page_ref._objgen
                                        print(f"{indent}  /A /D[0] is INDIRECT: objgen={objgen}")
                                    except:
                                        print(f"{indent}  /A /D[0] appears indirect")
                                else:
                                    is_dict = hasattr(d_page_ref, 'keys') or isinstance(d_page_ref, dict)
                                    if is_dict:
                                        print(f"{indent}  /A /D[0] is INLINE DICT (NOT indirect - viewer incompatible!)")
                except Exception as e:
                    print(f"{indent}  /A: <error reading: {e}>")
            
            print()
            count += 1
            
            # Check for children
            try:
                if '/First' in item:
                    child = item['/First'] if hasattr(item, '__getitem__') else item.First
                    while child is not None and count < limit:
                        inspect_item(child, level + 1)
                        if '/Next' in child:
                            child = child['/Next'] if hasattr(child, '__getitem__') else child.Next
                        else:
                            break
            except Exception as e:
                pass
            
            # Move to next sibling
            try:
                if '/Next' in item and count < limit:
                    return item['/Next'] if hasattr(item, '__getitem__') else item.Next
            except:
                pass
            return None
        
        # Start with first item
        current = outlines.First
        while current is not None and count < limit:
            next_item = inspect_item(current)
            if next_item is None:
                break
            current = next_item
        
        print(f"Total items inspected: {count}")
        return 0
        
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

def main():
    parser = argparse.ArgumentParser(description='Inspect PDF outline structure')
    parser.add_argument('pdf_path', help='Path to PDF file')
    parser.add_argument('--limit', type=int, default=20, help='Maximum items to inspect')
    args = parser.parse_args()
    
    sys.exit(inspect_outline_structure(args.pdf_path, args.limit))

if __name__ == '__main__':
    main()
