#!/usr/bin/env python3
"""Test script to verify /A actions work when modifying existing PDF"""

import sys
from pathlib import Path
from pikepdf import Pdf, Dictionary, Name, Array

# Open existing PDF (simulate our workflow)
if len(sys.argv) < 2:
    print("Usage: test_outline_a_existing.py <input_pdf>", file=sys.stderr)
    sys.exit(1)

input_path = Path(sys.argv[1])
if not input_path.exists():
    # Create a minimal PDF first
    pdf = Pdf.new()
    p1 = pdf.add_blank_page()
    p2 = pdf.add_blank_page()
    pdf.save(input_path)
    print(f"Created test PDF: {input_path}")

# Now open it and add outline
pdf = Pdf.open(input_path)
p2 = pdf.pages[1] if len(pdf.pages) > 1 else pdf.pages[0]

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

# Remove existing outline if present
if '/Outlines' in pdf.Root:
    del pdf.Root['/Outlines']

pdf.Root['/Outlines'] = outlines_dict

# Check before saving
print(f"Before save - /A in item: {'/A' in item}")
print(f"Before save - /A in outlines_dict['/First']: {'/A' in outlines_dict['/First']}")

# Save
output_path = input_path.parent / f"{input_path.stem}_with_outline.pdf"
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
    print("SUCCESS: /A action persisted!")
else:
    print("FAILED: /A action not found after save!")
    sys.exit(1)
