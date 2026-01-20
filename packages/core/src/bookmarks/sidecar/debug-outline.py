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

Original purpose: Debug script to inspect PDF outline items and their destinations.
Usage: python debug-outline.py <pdf_path> [--limit N]
"""

import sys
import argparse
from pikepdf import Pdf, Name

def inspect_outline(pdf_path, limit=10):
    """Inspect outline items in a PDF."""
    try:
        pdf = Pdf.open(pdf_path)
        
        if '/Outlines' not in pdf.Root:
            print(f"ERROR: PDF has no /Outlines in Root")
            return 1
        
        outlines = pdf.Root.Outlines
        
        if '/First' not in outlines:
            print(f"ERROR: /Outlines has no /First")
            return 1
        
        print(f"Inspecting outline items (first {limit}):")
        print("=" * 80)
        
        item = outlines.First
        count = 0
        
        def inspect_item(item, level=0):
            nonlocal count
            if count >= limit:
                return
            
            indent = "  " * level
            
            # Get title - item might be a dict-like object
            try:
                if hasattr(item, 'get'):
                    title = item.get('/Title', b'').decode('utf-8', errors='replace') if '/Title' in item else '<no title>'
                elif hasattr(item, '__getitem__'):
                    title = item['/Title'].decode('utf-8', errors='replace') if '/Title' in item else '<no title>'
                else:
                    title = str(item)
            except Exception as e:
                title = f'<error getting title: {e}>'
            
            # Check for destination - item might be dict-like
            try:
                has_dest = '/Dest' in item if hasattr(item, '__contains__') else False
                has_action = '/A' in item if hasattr(item, '__contains__') else False
            except:
                has_dest = False
                has_action = False
            
            print(f"{indent}Item {count + 1}:")
            print(f"{indent}  Title: {title}")
            print(f"{indent}  Has /Dest: {has_dest}")
            print(f"{indent}  Has /A: {has_action}")
            
            if has_dest:
                try:
                    dest = item['/Dest'] if hasattr(item, '__getitem__') else item.Dest
                    print(f"{indent}  /Dest type: {type(dest)}")
                    if isinstance(dest, list):
                        print(f"{indent}  /Dest array length: {len(dest)}")
                        if len(dest) > 0:
                            print(f"{indent}  /Dest[0] (page ref): {dest[0]}")
                            print(f"{indent}  /Dest[0] type: {type(dest[0])}")
                        if len(dest) > 1:
                            print(f"{indent}  /Dest[1] (view type): {dest[1]}")
                        if len(dest) > 2:
                            print(f"{indent}  /Dest[2+]: {dest[2:]}")
                    else:
                        print(f"{indent}  /Dest value: {dest}")
                except Exception as e:
                    print(f"{indent}  /Dest: <error reading: {e}>")
            
            if has_action:
                try:
                    action = item['/A'] if hasattr(item, '__getitem__') else item.A
                    print(f"{indent}  /A type: {type(action)}")
                    if isinstance(action, dict) or hasattr(action, '__contains__'):
                        if '/S' in action:
                            print(f"{indent}  /A /S: {action['/S'] if hasattr(action, '__getitem__') else action.S}")
                        if '/D' in action:
                            print(f"{indent}  /A /D: {action['/D'] if hasattr(action, '__getitem__') else action.D}")
                except Exception as e:
                    print(f"{indent}  /A: <error reading: {e}>")
            
            # Try to resolve page number
            if has_dest:
                try:
                    dest = item['/Dest'] if hasattr(item, '__getitem__') else item.Dest
                    if isinstance(dest, list) and len(dest) > 0:
                        page_ref = dest[0]
                        # Find page number
                        for i, page in enumerate(pdf.pages, 1):
                            if page.obj == page_ref:
                                print(f"{indent}  Resolved page: {i}")
                                break
                        else:
                            print(f"{indent}  Resolved page: <not found>")
                except Exception as e:
                    print(f"{indent}  Resolved page: <error: {e}>")
            
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
                print(f"{indent}  Children: <error: {e}>")
            
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
    parser = argparse.ArgumentParser(description='Inspect PDF outline items')
    parser.add_argument('pdf_path', help='Path to PDF file')
    parser.add_argument('--limit', type=int, default=10, help='Maximum items to inspect')
    args = parser.parse_args()
    
    sys.exit(inspect_outline(args.pdf_path, args.limit))

if __name__ == '__main__':
    main()
