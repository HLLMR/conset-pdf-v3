#!/usr/bin/env python3
"""
Layout transcript extraction via PyMuPDF
Returns standardized JSON transcript format

Uses dict/rawdict-first approach: spans and fonts extracted directly from
PyMuPDF's dict structure, with blocks as a derived view.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF not installed. Run: pip install pymupdf>=1.24.0", file=sys.stderr)
    sys.exit(1)


def extract_transcript(pdf_path: Path, options: Dict[str, Any]) -> Dict:
    """Extract layout transcript from PDF using dict/rawdict-first approach"""
    doc = fitz.open(str(pdf_path))
    
    pages = []
    total_chars = 0
    
    # Determine page subset
    page_indices = options.get('pages')
    if page_indices is None:
        page_indices = list(range(len(doc)))
    
    for page_idx in page_indices:
        if page_idx < 0 or page_idx >= len(doc):
            continue
            
        page = doc[page_idx]
        rotation = page.rotation
        
        # Get page dimensions (visual space after rotation)
        rect = page.rect
        if rotation in [90, 270]:
            width, height = rect.height, rect.width
        else:
            width, height = rect.width, rect.height
        
        # Extract spans using dict/rawdict-first approach (primary source)
        # Blocks are derived from spans, not the other way around
        text_dict = page.get_text("dict", sort=True)
        raw_dict = page.get_text("rawdict", sort=True)  # For font details
        
        spans = []
        span_idx = 0
        
        # Process dict structure: pages -> blocks -> lines -> spans
        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:  # Skip non-text blocks (type 0 = text)
                continue
                
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    # Extract bbox from span
                    bbox = span.get("bbox", [0, 0, 0, 0])
                    if len(bbox) != 4:
                        continue
                    
                    x0, y0, x1, y1 = bbox
                    
                    # PyMuPDF get_text("dict") returns bbox in top-left origin (y=0 at top, y increases downward)
                    # So we use the coordinates directly without flipping
                    # Visual space: y=0 at top, y increases downward (same as PyMuPDF)
                    visual_y0 = y0  # Top of span (already in top-left origin)
                    visual_y1 = y1  # Bottom of span (already in top-left origin)
                    
                    # Extract font information from span
                    font_name = span.get("font", "unknown")
                    font_size = span.get("size", 12)
                    font_flags = span.get("flags", 0)
                    
                    # Extract text
                    text = span.get("text", "")
                    
                    # Extract color if available
                    color = span.get("color", 0)
                    color_hex = None
                    if color != 0:
                        # Convert color integer to hex (RGB)
                        r = (color >> 16) & 0xFF
                        g = (color >> 8) & 0xFF
                        b = color & 0xFF
                        color_hex = f"#{r:02x}{g:02x}{b:02x}"
                    
                    span_id = f"page{page_idx}_span{span_idx}"
                    
                    spans.append({
                        "text": text,
                        "bbox": [x0, visual_y0, x1, visual_y1],
                        "fontName": font_name,
                        "fontSize": font_size,
                        "flags": {
                            "isBold": (font_flags & 16) != 0,
                            "isItalic": (font_flags & 1) != 0,
                            "isFixedPitch": (font_flags & 4) != 0,
                        },
                        "color": color_hex,
                        "spanId": span_id,
                        "pageIndex": page_idx,
                    })
                    
                    total_chars += len(text)
                    span_idx += 1
        
        # Extract vector lines if requested
        lines = []
        if options.get('includeLines', False):
            drawings = page.get_drawings()
            line_idx = 0
            for drawing in drawings:
                # Extract line segments from drawing paths
                items = drawing.get("items", [])
                for item in items:
                    if item[0] == "l":  # Line item
                        # Format: ["l", (x1, y1), (x2, y2)]
                        if len(item) >= 3:
                            start = item[1]
                            end = item[2]
                            # Convert to visual coordinates
                            visual_start_y = height - start[1]
                            visual_end_y = height - end[1]
                            
                            line_id = f"page{page_idx}_line{line_idx}"
                            lines.append({
                                "lineId": line_id,
                                "start": [start[0], visual_start_y],
                                "end": [end[0], visual_end_y],
                                "width": drawing.get("width", 1.0),
                                "color": None,  # Could extract from drawing if needed
                                "pageIndex": page_idx,
                            })
                            line_idx += 1
        
        # Calculate quality metrics
        quality = calculate_quality_metrics(spans, total_chars)
        
        pages.append({
            "pageNumber": page_idx + 1,
            "pageIndex": page_idx,
            "width": width,
            "height": height,
            "rotation": rotation,
            "spans": spans,
            "lines": lines if lines else None,
            "metadata": {
                "extractedCharCount": sum(len(s["text"]) for s in spans),
                "hasTextLayer": len(spans) > 0,
                "qualityScore": quality["confidenceScore"],
            }
        })
    
    # Get PyMuPDF version
    version_info = fitz.version
    engine_version = f"{version_info[0]}.{version_info[1]}.{version_info[2]}"
    
    return {
        "filePath": str(pdf_path),
        "extractionEngine": f"pymupdf-{engine_version}",
        "extractionDate": datetime.now().isoformat(),
        "pages": pages,
        "metadata": {
            "totalPages": len(doc),
            "hasTrueTextLayer": total_chars > 0,
        }
    }


def calculate_quality_metrics(spans: List[Dict], total_chars: int) -> Dict:
    """Calculate quality metrics for extracted spans"""
    if total_chars == 0:
        return {
            "extractedCharCount": 0,
            "whiteSpaceRatio": 0.0,
            "replacementCharCount": 0,
            "orderingSanityScore": 0.0,
            "estimatedOCRNeeded": True,
            "confidenceScore": 0.0,
        }
    
    # Count whitespace and replacement characters
    whitespace_count = 0
    replacement_count = 0
    
    for span in spans:
        text = span.get("text", "")
        whitespace_count += sum(1 for c in text if c.isspace())
        replacement_count += text.count('\ufffd')  # U+FFFD replacement character
    
    white_space_ratio = whitespace_count / total_chars if total_chars > 0 else 0.0
    
    # Simple ordering sanity: check if spans are roughly top-to-bottom, left-to-right
    # This is a simplified check - full implementation would be more sophisticated
    ordering_score = 1.0  # Placeholder - would need more sophisticated analysis
    
    # Estimate if OCR is needed (high replacement char ratio or very low char count)
    estimated_ocr = replacement_count > (total_chars * 0.05) or total_chars < 50
    
    # Confidence score (simplified)
    confidence = 1.0
    if estimated_ocr:
        confidence *= 0.5
    if white_space_ratio > 0.5:
        confidence *= 0.8
    if replacement_count > 0:
        confidence *= max(0.5, 1.0 - (replacement_count / total_chars))
    
    return {
        "extractedCharCount": total_chars,
        "whiteSpaceRatio": white_space_ratio,
        "replacementCharCount": replacement_count,
        "orderingSanityScore": ordering_score,
        "estimatedOCRNeeded": estimated_ocr,
        "confidenceScore": max(0.0, min(1.0, confidence)),
    }


def main():
    parser = argparse.ArgumentParser(description='Extract layout transcript from PDF')
    parser.add_argument('--input', required=True, help='Input PDF path')
    parser.add_argument('--output', required=True, help='Output JSON path')
    parser.add_argument('--pages', help='Comma-separated page indices (0-based)')
    parser.add_argument('--include-lines', action='store_true', help='Include vector lines')
    args = parser.parse_args()
    
    options = {
        'pages': [int(x) for x in args.pages.split(',')] if args.pages else None,
        'includeLines': args.include_lines,
    }
    
    transcript = extract_transcript(Path(args.input), options)
    
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(transcript, f, indent=2, ensure_ascii=False)
    
    print(f"Extracted transcript: {len(transcript['pages'])} pages", file=sys.stderr)


if __name__ == '__main__':
    main()
