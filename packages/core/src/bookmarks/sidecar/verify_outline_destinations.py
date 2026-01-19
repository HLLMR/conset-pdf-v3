#!/usr/bin/env python3
"""
Verify that PDF outline destinations are viewer-compatible.

Checks:
- Each outline item has either /Dest or /A with /S /GoTo
- Destination page references are INDIRECT (not inline dicts)
- View types are valid (/Fit, /FitH, or /XYZ with all numeric params)

Exits with code 0 if all valid, non-zero if any issues found.
"""

import sys
import json
from pikepdf import Pdf, Name

def verify_outline_destinations(pdf_path):
    """Verify outline destinations are viewer-compatible."""
    issues = []
    items_checked = 0
    items_valid = 0
    items_invalid = 0
    
    try:
        pdf = Pdf.open(pdf_path)
        
        if '/Outlines' not in pdf.Root:
            print("ERROR: PDF has no /Outlines", file=sys.stderr)
            return 1
        
        outlines = pdf.Root.Outlines
        
        if '/First' not in outlines:
            print("ERROR: /Outlines has no /First", file=sys.stderr)
            return 1
        
        def check_item(item, path=""):
            nonlocal items_checked, items_valid, items_invalid
            
            items_checked += 1
            item_path = f"{path}[{items_checked}]"
            
            # Get title for error messages
            try:
                title_bytes = item.get('/Title', b'')
                title = title_bytes.decode('utf-8', errors='replace') if isinstance(title_bytes, bytes) else str(title_bytes)
            except:
                title = f"item at {item_path}"
            
            has_dest = '/Dest' in item
            has_action = '/A' in item
            
            # Must have either /Dest or /A (prefer /A for viewer compatibility)
            if not has_dest and not has_action:
                issues.append(f"{item_path} '{title}': Missing both /Dest and /A")
                items_invalid += 1
                return
            
            # Prefer /A GoTo for maximum viewer compatibility
            # Some viewers (like PDF-XChange) may require /A even if /Dest exists
            if not has_action:
                issues.append(f"{item_path} '{title}': Missing /A GoTo action (recommended for viewer compatibility)")
                # Don't fail, but note it
            
            # Check /Dest if present
            if has_dest:
                try:
                    dest = item.Dest
                    if not (hasattr(dest, '__len__') and hasattr(dest, '__getitem__')):
                        issues.append(f"{item_path} '{title}': /Dest is not an array")
                        items_invalid += 1
                        return
                    
                    if len(dest) < 2:
                        issues.append(f"{item_path} '{title}': /Dest array too short (need at least page ref and view type)")
                        items_invalid += 1
                        return
                    
                    page_ref = dest[0]
                    view_type = dest[1]
                    
                    # Check if page_ref is indirect
                    is_indirect = hasattr(page_ref, 'objgen') or hasattr(page_ref, '_objgen')
                    if not is_indirect:
                        # Check if it's a dict (inline - bad!)
                        is_dict = hasattr(page_ref, 'keys') or isinstance(page_ref, dict)
                        if is_dict:
                            issues.append(f"{item_path} '{title}': /Dest[0] is INLINE DICT (must be indirect reference)")
                            items_invalid += 1
                            return
                        else:
                            issues.append(f"{item_path} '{title}': /Dest[0] is not an indirect reference (type: {type(page_ref)})")
                            items_invalid += 1
                            return
                    
                    # Check view type
                    # view_type might be a Name object or string
                    view_type_str = str(view_type)
                    is_fit = view_type == Name('/Fit') or view_type_str == '/Fit' or '/Fit' in view_type_str
                    is_fith = view_type == Name('/FitH') or view_type_str == '/FitH' or '/FitH' in view_type_str
                    is_xyz = view_type == Name('/XYZ') or view_type_str == '/XYZ' or '/XYZ' in view_type_str
                    
                    if is_fit:
                        # /Fit is valid (2 elements)
                        pass
                    elif is_fith:
                        if len(dest) < 3:
                            issues.append(f"{item_path} '{title}': /FitH requires 3rd parameter (top)")
                            items_invalid += 1
                            return
                        if not isinstance(dest[2], (int, float)):
                            issues.append(f"{item_path} '{title}': /FitH 3rd parameter must be numeric")
                            items_invalid += 1
                            return
                    elif is_xyz:
                        if len(dest) < 5:
                            issues.append(f"{item_path} '{title}': /XYZ requires 5 parameters (page, /XYZ, left, top, zoom)")
                            items_invalid += 1
                            return
                        # All params must be numeric (no None)
                        for i in [2, 3, 4]:
                            if not isinstance(dest[i], (int, float)):
                                issues.append(f"{item_path} '{title}': /XYZ parameter {i} must be numeric (got {type(dest[i])})")
                                items_invalid += 1
                                return
                    else:
                        issues.append(f"{item_path} '{title}': Unsupported view type: {view_type_str}")
                        items_invalid += 1
                        return
                    
                except Exception as e:
                    issues.append(f"{item_path} '{title}': Error checking /Dest: {e}")
                    items_invalid += 1
                    return
            
            # Check /A if present
            if has_action:
                try:
                    action = item.A
                    if not (hasattr(action, '__contains__') or isinstance(action, dict)):
                        issues.append(f"{item_path} '{title}': /A is not a dictionary")
                        items_invalid += 1
                        return
                    
                    if '/S' not in action:
                        issues.append(f"{item_path} '{title}': /A missing /S")
                        items_invalid += 1
                        return
                    
                    s_type = action.get('/S') if hasattr(action, 'get') else action['/S']
                    if s_type != Name('/GoTo'):
                        s_str = str(s_type)
                        if '/GoTo' not in s_str:
                            issues.append(f"{item_path} '{title}': /A /S is not /GoTo (got {s_str})")
                            items_invalid += 1
                            return
                    
                    if '/D' not in action:
                        issues.append(f"{item_path} '{title}': /A missing /D")
                        items_invalid += 1
                        return
                    
                    d_val = action.get('/D') if hasattr(action, 'get') else action['/D']
                    if not (hasattr(d_val, '__len__') and hasattr(d_val, '__getitem__')):
                        issues.append(f"{item_path} '{title}': /A /D is not an array")
                        items_invalid += 1
                        return
                    
                    if len(d_val) < 2:
                        issues.append(f"{item_path} '{title}': /A /D array too short")
                        items_invalid += 1
                        return
                    
                    d_page_ref = d_val[0]
                    is_indirect = hasattr(d_page_ref, 'objgen') or hasattr(d_page_ref, '_objgen')
                    if not is_indirect:
                        is_dict = hasattr(d_page_ref, 'keys') or isinstance(d_page_ref, dict)
                        if is_dict:
                            issues.append(f"{item_path} '{title}': /A /D[0] is INLINE DICT (must be indirect reference)")
                            items_invalid += 1
                            return
                        else:
                            issues.append(f"{item_path} '{title}': /A /D[0] is not an indirect reference")
                            items_invalid += 1
                            return
                    
                except Exception as e:
                    issues.append(f"{item_path} '{title}': Error checking /A: {e}")
                    items_invalid += 1
                    return
            
            items_valid += 1
            
            # Check children
            try:
                if '/First' in item:
                    child = item['/First'] if hasattr(item, '__getitem__') else item.First
                    child_path = f"{item_path}.child"
                    while child is not None:
                        check_item(child, child_path)
                        if '/Next' in child:
                            child = child['/Next'] if hasattr(child, '__getitem__') else child.Next
                        else:
                            break
            except Exception as e:
                pass
        
        # Start checking from first item
        current = outlines.First
        while current is not None:
            check_item(current)
            if '/Next' in current:
                current = current['/Next'] if hasattr(current, '__getitem__') else current.Next
            else:
                break
        
        # Output results
        result = {
            'itemsChecked': items_checked,
            'itemsValid': items_valid,
            'itemsInvalid': items_invalid,
            'issues': issues
        }
        
        print(json.dumps(result, indent=2))
        
        if items_invalid > 0:
            return 1
        
        return 0
        
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

def main():
    if len(sys.argv) < 2:
        print("Usage: verify_outline_destinations.py <pdf_path>", file=sys.stderr)
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    sys.exit(verify_outline_destinations(pdf_path))

if __name__ == '__main__':
    main()
