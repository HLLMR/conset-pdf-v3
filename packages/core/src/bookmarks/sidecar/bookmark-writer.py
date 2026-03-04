#!/usr/bin/env python3
"""
Bookmark writer sidecar script

Writes bookmarks to PDF using pikepdf (QPDF-based).
Reads bookmark tree from JSON and writes to PDF.
"""

import argparse
import json
import sys
from pathlib import Path

try:
    from pikepdf import Pdf, OutlineItem, Name
except ImportError:
    print("Error: pikepdf not installed. Run: pip install pikepdf>=8.0.0", file=sys.stderr)
    sys.exit(1)


def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Write bookmarks or passthrough PDF via pikepdf')
    parser.add_argument('--input', required=True, help='Input PDF path')
    parser.add_argument('--output', required=True, help='Output PDF path')
    parser.add_argument('--bookmarks-json', required=False, help='Bookmarks JSON path (required for bookmarks mode)')
    parser.add_argument('--mode', default='bookmarks', choices=['bookmarks', 'passthrough'], help='Operation mode: bookmarks (write bookmarks) or passthrough (write PDF via pikepdf for safety)')
    return parser.parse_args()


def load_bookmarks(json_path: Path) -> dict:
    """Load bookmarks from JSON file"""
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_pdf_passthrough(input_path: Path, output_path: Path):
    """Write PDF using pikepdf (passthrough mode)
    
    This mode simply opens and re-saves the PDF using pikepdf.
    This provides deterministic output and improves cross-viewer compatibility.
    
    Args:
        input_path: Path to input PDF
        output_path: Path to output PDF
    """
    # Open PDF
    pdf = Pdf.open(input_path)
    
    # Save with linearization for better viewer compatibility
    pdf.save(output_path, linearize=True)


def create_outline_item(bookmark: dict, pdf: Pdf, parent_item=None):
    """Create an outline item dictionary from bookmark dict and make it indirect.
    
    Args:
        bookmark: Bookmark dict with title, pageIndex, level, etc.
        pdf: Pdf object
        parent_item: Optional parent outline item (for hierarchy)
    """
    from pikepdf import Dictionary, Array
    page_index = bookmark.get('pageIndex', 0)
    fit_type = bookmark.get('fitType', 'Fit')  # Default to 'Fit' for viewer compatibility
    top = bookmark.get('top')
    left = bookmark.get('left')
    zoom = bookmark.get('zoom')
    
    # Validate page index
    if page_index < 0 or page_index >= len(pdf.pages):
        raise ValueError(f"Page index {page_index} out of range (0-{len(pdf.pages) - 1})")
    
    # Create destination
    page = pdf.pages[page_index]
    # Use page.obj to get the underlying PDF object (required in newer pikepdf)
    # Ensure it's an indirect reference (page.obj should already be indirect)
    page_obj = page.obj
    
    # Determine view type and parameters
    # Destination format: [page_obj, fit_type, ...params]
    # Use /Fit by default for maximum viewer compatibility (avoids /XYZ with null zoom)
    # Create NEW arrays for each item to avoid reference issues
    if fit_type == 'Fit' or fit_type is None:
        # Fit entire page: [page_obj, '/Fit'] - safest option
        dest_array = Array([page_obj, Name('/Fit')])
        action_dest_array = Array([page_obj, Name('/Fit')])
    elif fit_type == 'FitH':
        # Fit page width with optional top: [page_obj, '/FitH', top]
        top_val = top if top is not None else 792
        dest_array = Array([page_obj, Name('/FitH'), top_val])
        action_dest_array = Array([page_obj, Name('/FitH'), top_val])
    elif fit_type == 'XYZ':
        # XYZ fit: [page_obj, '/XYZ', left, top, zoom]
        # Only use XYZ if all parameters are provided (zoom must not be None)
        if zoom is not None and left is not None and top is not None:
            dest_array = Array([page_obj, Name('/XYZ'), left, top, zoom])
            action_dest_array = Array([page_obj, Name('/XYZ'), left, top, zoom])
        else:
            # Fallback to /Fit if XYZ params incomplete
            dest_array = Array([page_obj, Name('/Fit')])
            action_dest_array = Array([page_obj, Name('/Fit')])
    else:
        # Default: /Fit for maximum compatibility
        dest_array = Array([page_obj, Name('/Fit')])
        action_dest_array = Array([page_obj, Name('/Fit')])
    
    # Create /A GoTo action with separate destination array
    goto_action = Dictionary({
        '/S': Name('/GoTo'),
        '/D': action_dest_array
    })
    
    # Create outline item dictionary with both /Dest and /A for maximum viewer compatibility
    outline_dict = Dictionary({
        '/Title': bookmark['title'].encode('utf-8'),
        '/Dest': dest_array,
        '/A': goto_action
    })
    
    # Set /Parent if this is a child item
    if parent_item is not None:
        outline_dict['/Parent'] = parent_item
    
    # Add children recursively
    children = bookmark.get('children', [])
    if children:
        child_items = []
        for child in children:
            # Create child item (will be made indirect later)
            child_dict = create_outline_item(child, pdf, parent_item=outline_dict)
            child_items.append(child_dict)
        
        if child_items:
            # Make all child items indirect BEFORE linking
            indirect_children = []
            for child_dict in child_items:
                indirect_child = pdf.make_indirect(child_dict)
                indirect_children.append(indirect_child)
            
            # Set /First to first child
            outline_dict['/First'] = indirect_children[0]
            # Link children with /Next and /Prev
            for i in range(len(indirect_children)):
                if i > 0:
                    indirect_children[i]['/Prev'] = indirect_children[i - 1]
                if i < len(indirect_children) - 1:
                    indirect_children[i]['/Next'] = indirect_children[i + 1]
                # Parent already set in create_outline_item
            # Set /Last to last child
            outline_dict['/Last'] = indirect_children[-1]
            # Set /Count on parent
            outline_dict['/Count'] = len(indirect_children)
    
    # Make the item indirect BEFORE returning
    # This ensures all outline items are indirect objects
    # Note: When making indirect, we need to ensure destination arrays are also properly referenced
    indirect_item = pdf.make_indirect(outline_dict)
    
    # After making indirect, verify /Dest and /A are still accessible
    # The indirect object should preserve all dictionary entries
    return indirect_item


def write_bookmarks(input_path: Path, output_path: Path, bookmarks_json: Path):
    """Write bookmarks to PDF"""
    # Load PDF
    pdf = Pdf.open(input_path)
    
    # Load bookmarks
    bookmarks_data = load_bookmarks(bookmarks_json)
    bookmarks = bookmarks_data.get('bookmarks', [])
    
    # Clear existing bookmarks by removing /Outlines from Root
    if '/Outlines' in pdf.Root:
        del pdf.Root['/Outlines']
    
    # Add new bookmarks manually using Dictionary approach for full control
    # IMPORTANT: All items must be indirect objects for proper viewer support
    # Build hierarchical tree structure from flat bookmark list
    if bookmarks:
        from pikepdf import Dictionary as PdfDict
        
        # Build tree structure: group by level and parent relationships
        # For now, we'll build a simple hierarchy based on level field in bookmark dict
        # If level is provided, use it; otherwise infer from position
        
        # Create outline items (they are made indirect inside create_outline_item)
        outline_items = []
        parent_stack = []  # Stack of parent items by level: [level0_parent, level1_parent, ...]
        
        for bookmark in bookmarks:
            level = bookmark.get('level', 0)
            outline_item = create_outline_item(bookmark, pdf, None)
            outline_items.append(outline_item)
            
            # Set parent if we have a parent at level-1
            if level > 0 and len(parent_stack) >= level:
                parent_item = parent_stack[level - 1]
                outline_item['/Parent'] = parent_item
                
                # Add to parent's children list
                if '/First' not in parent_item:
                    parent_item['/First'] = outline_item
                    parent_item['/Last'] = outline_item
                else:
                    # Link to existing children
                    last_child = parent_item['/Last']
                    last_child['/Next'] = outline_item
                    outline_item['/Prev'] = last_child
                    parent_item['/Last'] = outline_item
                
                # Update parent's /Count
                if '/Count' not in parent_item:
                    parent_item['/Count'] = 0
                parent_item['/Count'] = parent_item['/Count'] + 1
            
            # Update parent stack: truncate to current level, then add this item
            # Ensure parent_stack has enough entries for current level
            while len(parent_stack) <= level:
                parent_stack.append(None)
            parent_stack[level] = outline_item
        
        # Link root-level items with /Next and /Prev
        root_items = [item for item in outline_items if '/Parent' not in item]
        for i in range(len(root_items)):
            if i > 0:
                root_items[i]['/Prev'] = root_items[i - 1]
            if i < len(root_items) - 1:
                root_items[i]['/Next'] = root_items[i + 1]
        
        # Calculate total count (including children)
        def count_items(item):
            count = 1  # Count self
            if '/First' in item:
                child = item['/First']
                while child is not None:
                    count += count_items(child)
                    if '/Next' in child:
                        child = child['/Next']
                    else:
                        break
            return count
        
        total_count = sum(count_items(item) for item in root_items)
        
        # Create outline dictionary
        if root_items:
            outlines_dict = PdfDict({
                '/Type': Name('/Outlines'),
                '/First': root_items[0],
                '/Last': root_items[-1],
                '/Count': total_count  # Total count including all children
            })
            # Make outlines dict indirect and add to PDF
            pdf.Root['/Outlines'] = pdf.make_indirect(outlines_dict)
    
    # Save PDF with /A actions
    pdf.save(output_path, linearize=True)
    
    # Verify outline tree structure and linkage
    verify_pdf = Pdf.open(output_path)
    if '/Outlines' in verify_pdf.Root and '/First' in verify_pdf.Root.Outlines:
        outlines = verify_pdf.Root.Outlines
        expected_count = outlines.get('/Count', 0)
        
        # Recursively walk the outline tree and count reachable items
        def walk_tree(item, visited=None):
            """Recursively walk outline tree and return count"""
            if item is None:
                return 0
            if visited is None:
                visited = set()
            
            # Prevent infinite loops using objgen
            item_objgen = None
            try:
                if hasattr(item, 'objgen'):
                    item_objgen = item.objgen
            except:
                pass
            
            if item_objgen and item_objgen in visited:
                return 0  # Already visited
            if item_objgen:
                visited.add(item_objgen)
            
            count = 1  # Count self
            
            # Walk children
            if '/First' in item:
                child = item.First
                while child is not None:
                    count += walk_tree(child, visited)
                    if '/Next' in child:
                        child = child.Next
                    else:
                        break
            
            return count
        
        # Walk root-level items
        items_checked = 0
        items_without_dest = 0
        items_without_action = 0
        items_not_indirect = 0
        visited = set()
        
        def check_item(item):
            """Check a single item and recursively check children"""
            nonlocal items_checked, items_without_dest, items_without_action, items_not_indirect
            
            if item is None:
                return
            
            # Prevent infinite loops
            item_objgen = None
            try:
                if hasattr(item, 'objgen'):
                    item_objgen = item.objgen
            except:
                pass
            
            if item_objgen and item_objgen in visited:
                return
            if item_objgen:
                visited.add(item_objgen)
            
            items_checked += 1
            
            # Check if indirect
            if not hasattr(item, 'objgen') or item.objgen == (0, 0):
                items_not_indirect += 1
            
            if '/Dest' not in item:
                items_without_dest += 1
            if '/A' not in item:
                items_without_action += 1
            
            # Check children
            if '/First' in item:
                child = item.First
                while child is not None:
                    check_item(child)
                    if '/Next' in child:
                        child = child.Next
                    else:
                        break
        
        # Start from first root item
        item = outlines.First
        while item is not None:
            check_item(item)
            if '/Next' in item:
                item = item.Next
            else:
                break
        
        # Verify linkage
        if items_checked != expected_count:
            print(f"Error: Outline tree linkage broken. Expected {expected_count} items, but only {items_checked} reachable via tree walk", file=sys.stderr)
            sys.exit(1)
        
        if items_not_indirect > 0:
            print(f"Error: {items_not_indirect} outline item(s) are not indirect objects (objgen=(0,0))", file=sys.stderr)
            sys.exit(1)
        
        if items_without_dest > 0:
            print(f"Error: {items_without_dest} outline item(s) missing destinations", file=sys.stderr)
            sys.exit(1)
        
        if items_without_action > 0:
            print(f"Warning: {items_without_action} outline item(s) missing /A GoTo actions (may affect viewer compatibility)", file=sys.stderr)
            # Don't fail, but warn


def main():
    """Main entry point"""
    args = parse_args()
    
    input_path = Path(args.input)
    output_path = Path(args.output)
    mode = args.mode
    
    # Validate inputs
    if not input_path.exists():
        print(f"Error: Input PDF not found: {input_path}", file=sys.stderr)
        sys.exit(1)
    
    try:
        if mode == 'passthrough':
            # Passthrough mode: just write the PDF and through pikepdf for safety
            write_pdf_passthrough(input_path, output_path)
            print(f"Successfully wrote PDF to {output_path}")
        elif mode == 'bookmarks':
            # Bookmarks mode: write bookmarks to PDF
            bookmarks_json = Path(args.bookmarks_json)
            if not bookmarks_json.exists():
                print(f"Error: Bookmarks JSON not found: {bookmarks_json}", file=sys.stderr)
                sys.exit(1)
            write_bookmarks(input_path, output_path, bookmarks_json)
            print(f"Successfully wrote bookmarks to {output_path}")
        else:
            print(f"Error: Unknown mode: {mode}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
