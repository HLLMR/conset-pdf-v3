#!/usr/bin/env python3
"""
DELETION CANDIDATE: Standalone test script (not used in production)

Status: Orphaned - standalone test script, not imported or called
Evidence:
  - Not imported by any TypeScript/JavaScript code
  - Not referenced in tests
  - Manual testing script only

Action: Mark for deletion - was used during development but not needed in production
TODO: Remove after confirming no manual usage
Tracking: Cleanup pass 2026-01-17
"""

# DELETION CANDIDATE: This file can be removed
# Original purpose: Test script to verify /A actions are written correctly

import sys
from pathlib import Path
from pikepdf import Pdf, Dictionary, Name, Array

# Create a minimal PDF
pdf = Pdf.new()
p1 = pdf.add_blank_page()
p2 = pdf.add_blank_page()

# Create destination
dest = Array([p2.obj, Name('/Fit')])

# Create /A GoTo action
goto_action = Dictionary({
    '/S': Name('/GoTo'),
    '/D': dest
})

# Create outline item with both /Dest and /A
item = Dictionary({
    '/Title': b'Test Bookmark',
    '/Dest': dest,
    '/A': goto_action
})

# Create outline
outlines_dict = Dictionary({
    '/Type': Name('/Outlines'),
    '/First': item,
    '/Last': item,
    '/Count': 1
})

pdf.Root['/Outlines'] = outlines_dict

# Check before saving
print(f"Before save - /A in item: {'/A' in item}")
print(f"Before save - /A in outlines_dict['/First']: {'/A' in outlines_dict['/First']}")

# Save
output_path = Path(sys.argv[1]) if len(sys.argv) > 1 else 'test_outline_a.pdf'
pdf.save(output_path, linearize=True)

# Re-open and check
pdf2 = Pdf.open(output_path)
item2 = pdf2.Root.Outlines.First

print(f"After save - /A in item: {'/A' in item2}")
print(f"After save - /Dest in item: {'/Dest' in item2}")

if '/A' in item2:
    action = item2['/A']
    print(f"/A /S: {action.get('/S')}")
    print(f"/A /D: {action.get('/D')}")
