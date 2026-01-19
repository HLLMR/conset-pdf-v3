#!/usr/bin/env python3
"""
Debug script to inspect PDF outline tree structure and linkage.

Usage:
    python debug_outline_tree.py <pdf_path>
"""

import sys
import argparse
from pikepdf import Pdf, Name

def inspect_outline_tree(pdf_path):
    """Inspect outline tree structure and linkage."""
    try:
        pdf = Pdf.open(pdf_path)
        
        print("=" * 80)
        print("OUTLINE TREE DIAGNOSTIC")
        print("=" * 80)
        
        # Check if /Outlines exists
        if '/Outlines' not in pdf.Root:
            print("ERROR: PDF has no /Outlines in Root")
            return 1
        
        outlines = pdf.Root.Outlines
        print(f"\n/Outlines object found")
        
        # Check /Outlines properties
        if '/Type' in outlines:
            print(f"  /Type: {outlines.get('/Type')}")
        if '/Count' in outlines:
            print(f"  /Count: {outlines.get('/Count')}")
        if '/First' in outlines:
            first_obj = outlines.get('/First')
            if hasattr(first_obj, 'objgen'):
                print(f"  /First: objgen={first_obj.objgen}")
            else:
                print(f"  /First: {first_obj} (type: {type(first_obj)})")
        else:
            print(f"  /First: MISSING")
        if '/Last' in outlines:
            last_obj = outlines.get('/Last')
            if hasattr(last_obj, 'objgen'):
                print(f"  /Last: objgen={last_obj.objgen}")
            else:
                print(f"  /Last: {last_obj} (type: {type(last_obj)})")
        else:
            print(f"  /Last: MISSING")
        
        # Walk the root-level linked list
        print(f"\n--- Root-level linked list walk ---")
        if '/First' not in outlines:
            print("ERROR: /Outlines has no /First")
            return 1
        
        item = outlines.First
        root_items = []
        root_count = 0
        
        while item is not None:
            root_count += 1
            
            # Get title
            try:
                title_bytes = item.get('/Title', b'')
                if isinstance(title_bytes, bytes):
                    title = title_bytes.decode('utf-8', errors='replace')
                else:
                    title = str(title_bytes)
            except Exception as e:
                title = f'<error: {e}>'
            
            # Check if indirect
            is_indirect = hasattr(item, 'objgen')
            objgen_str = f"objgen={item.objgen}" if is_indirect else "NOT INDIRECT"
            
            # Check properties
            has_dest = '/Dest' in item
            has_action = '/A' in item
            has_next = '/Next' in item
            has_prev = '/Prev' in item
            has_parent = '/Parent' in item
            has_first = '/First' in item
            has_last = '/Last' in item
            has_count = '/Count' in item
            
            print(f"\nRoot item {root_count}:")
            print(f"  Title: {title[:60]}")
            print(f"  {objgen_str}")
            print(f"  Has /Dest: {has_dest}")
            print(f"  Has /A: {has_action}")
            print(f"  Has /Next: {has_next}")
            print(f"  Has /Prev: {has_prev}")
            print(f"  Has /Parent: {has_parent}")
            print(f"  Has /First (children): {has_first}")
            print(f"  Has /Last (children): {has_last}")
            print(f"  Has /Count: {has_count}")
            
            if has_count:
                print(f"  /Count value: {item.get('/Count')}")
            
            # Check children if present
            if has_first:
                child = item.First
                child_count = 0
                print(f"  Children:")
                while child is not None:
                    child_count += 1
                    try:
                        child_title_bytes = child.get('/Title', b'')
                        child_title = child_title_bytes.decode('utf-8', errors='replace') if isinstance(child_title_bytes, bytes) else str(child_title_bytes)
                    except:
                        child_title = '<error>'
                    
                    child_is_indirect = hasattr(child, 'objgen')
                    child_objgen = f"objgen={child.objgen}" if child_is_indirect else "NOT INDIRECT"
                    child_has_next = '/Next' in child
                    child_has_prev = '/Prev' in child
                    child_has_parent = '/Parent' in child
                    
                    print(f"    Child {child_count}: {child_title[:50]}")
                    print(f"      {child_objgen}")
                    print(f"      Has /Next: {child_has_next}")
                    print(f"      Has /Prev: {child_has_prev}")
                    print(f"      Has /Parent: {child_has_parent}")
                    
                    if '/Next' in child:
                        child = child.Next
                    else:
                        break
                
                print(f"    Total children reachable: {child_count}")
            
            root_items.append(item)
            
            # Move to next sibling
            if '/Next' in item:
                item = item.Next
            else:
                break
        
        print(f"\n--- Summary ---")
        print(f"Root-level items reachable via /Next chain: {root_count}")
        print(f"Expected (from /Outlines /Count): {outlines.get('/Count', 'N/A')}")
        
        if root_count == 1 and outlines.get('/Count', 0) > 1:
            print(f"\n⚠️  WARNING: Only 1 root item reachable, but /Count suggests more!")
            print(f"   This indicates broken /Next linkage.")
        
        return 0
        
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

def main():
    parser = argparse.ArgumentParser(description='Inspect PDF outline tree structure')
    parser.add_argument('pdf_path', help='Path to PDF file')
    args = parser.parse_args()
    
    sys.exit(inspect_outline_tree(args.pdf_path))

if __name__ == '__main__':
    main()
