/**
 * Tests for algorithmic narrative parsing
 */

import {
  extractNarrativeTextFromPdf,
  parseNarrativeAlgorithmic,
} from '@conset-pdf/core';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Narrative Algorithmic Parsing', () => {
  const fixturePath = join(__dirname, '..', 'fixtures', 'narratives', 'Add3 Narrative.pdf');
  
  test('parses narrative PDF into instruction set', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    // Extract text
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    
    // Parse
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Verify structure
    expect(instructionSet).toHaveProperty('meta');
    expect(instructionSet).toHaveProperty('drawings');
    expect(instructionSet).toHaveProperty('specs');
    expect(instructionSet).toHaveProperty('issues');
    
    expect(Array.isArray(instructionSet.drawings)).toBe(true);
    expect(Array.isArray(instructionSet.specs)).toBe(true);
    expect(Array.isArray(instructionSet.issues)).toBe(true);
    
    // Verify meta
    expect(instructionSet.meta.fileHash).toBe(doc.fileHash);
    expect(instructionSet.meta.pageCount).toBe(doc.pageCount);
    expect(instructionSet.meta.extractedAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
  
  test('extracts drawing instructions', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Add3 Narrative should have drawings section
    expect(instructionSet.drawings.length).toBeGreaterThanOrEqual(1);
    
    // Verify drawing instruction structure
    const drawing = instructionSet.drawings[0];
    expect(drawing).toHaveProperty('kind', 'sheetChange');
    expect(drawing).toHaveProperty('changeType');
    expect(drawing).toHaveProperty('sheetIdRaw');
    expect(drawing).toHaveProperty('sheetIdNormalized');
    expect(drawing).toHaveProperty('evidence');
    expect(drawing).toHaveProperty('source', 'algorithmic');
    expect(drawing.evidence).toHaveProperty('pageNumber');
    expect(drawing.evidence).toHaveProperty('rawLine');
    
    // Verify normalized ID is not empty
    expect(drawing.sheetIdNormalized.length).toBeGreaterThan(0);
    
    // Verify at least one drawing has changeType="revised_reissued"
    const revisedDrawings = instructionSet.drawings.filter(d => d.changeType === 'revised_reissued');
    expect(revisedDrawings.length).toBeGreaterThanOrEqual(1);
    
    // Verify at least one drawing has notes containing "Formerly named"
    const drawingsWithNotes = instructionSet.drawings.filter(d => 
      d.notes && d.notes.some(note => note.includes('Formerly named'))
    );
    expect(drawingsWithNotes.length).toBeGreaterThanOrEqual(1);
  });
  
  test('extracts spec instructions', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Add3 Narrative should have specs section
    expect(instructionSet.specs.length).toBeGreaterThanOrEqual(4);
    
    // Verify spec instruction structure
    const spec = instructionSet.specs[0];
    expect(spec).toHaveProperty('kind', 'specSectionChange');
    expect(spec).toHaveProperty('sectionIdRaw');
    expect(spec).toHaveProperty('sectionIdNormalized');
    expect(spec).toHaveProperty('actions');
    expect(spec).toHaveProperty('evidence');
    expect(spec).toHaveProperty('source', 'algorithmic');
    expect(spec.evidence).toHaveProperty('pageNumber');
    expect(spec.evidence).toHaveProperty('rawBlock');
    
    // Verify normalized ID format (NN NN NN)
    expect(spec.sectionIdNormalized).toMatch(/^\d{2} \d{2} \d{2}$/);
    
    // Verify actions array
    expect(Array.isArray(spec.actions)).toBe(true);
    if (spec.actions.length > 0) {
      expect(spec.actions[0]).toHaveProperty('verb');
      expect(spec.actions[0]).toHaveProperty('rawText');
    }
    
    // Verify at least one spec action has a verb that is not "unknown"
    const allActions = instructionSet.specs.flatMap(s => s.actions);
    const nonUnknownActions = allActions.filter(a => a.verb !== 'unknown');
    expect(nonUnknownActions.length).toBeGreaterThanOrEqual(1);
  });
  
  test('produces no error-level issues for valid narrative', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Should not have any error-level issues
    const errors = instructionSet.issues.filter(i => i.severity === 'error');
    expect(errors.length).toBe(0);
  });
  
  test('extracts known sheet IDs from narrative', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Add3 Narrative should have at least 3 drawing sheets
    expect(instructionSet.drawings.length).toBeGreaterThanOrEqual(3);
    
    const normalizedIds = instructionSet.drawings.map(d => d.sheetIdNormalized);
    
    // Verify we have known sheet IDs from Add3 Narrative
    const knownIds = ['G0.01', 'G1.11', 'G2.11A', 'M2.11A', 'M5.01'];
    const foundKnownIds = knownIds.filter(knownId => 
      normalizedIds.some(id => id.includes(knownId.replace('.', '')) || id === knownId)
    );
    expect(foundKnownIds.length).toBeGreaterThanOrEqual(3); // At least 3 known IDs found
    
    // Verify IDs are properly normalized (no excessive spaces, uppercase)
    for (const id of normalizedIds) {
      expect(id).toBe(id.toUpperCase());
      expect(id).not.toMatch(/\s{2,}/); // No multiple spaces
    }
    
    // Verify specific known IDs are present
    expect(normalizedIds).toContain('G0.01');
    expect(normalizedIds).toContain('G1.11');
  });
  
  test('extracts known section IDs from narrative', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Add3 Narrative should have at least 4 spec sections
    expect(instructionSet.specs.length).toBeGreaterThanOrEqual(4);
    
    const normalizedIds = instructionSet.specs.map(s => s.sectionIdNormalized);
    
    // Verify we have known section IDs from Add3 Narrative
    const knownIds = ['00 01 10', '23 02 00', '00 31 21', '23 82 23'];
    const foundKnownIds = knownIds.filter(knownId => normalizedIds.includes(knownId));
    expect(foundKnownIds.length).toBeGreaterThanOrEqual(4); // All 4 known IDs found
    
    // Verify all IDs are in "NN NN NN" format
    for (const id of normalizedIds) {
      expect(id).toMatch(/^\d{2} \d{2} \d{2}$/);
    }
  });
  
  test('spec section boundaries stop at drawings headings', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Find section "23 82 23"
    const section238223 = instructionSet.specs.find(s => s.sectionIdNormalized === '23 82 23');
    expect(section238223).toBeDefined();
    
    if (section238223) {
      // Verify actions do NOT include drawings section content
      const actionTexts = section238223.actions.map(a => a.rawText);
      
      // Should NOT contain drawings headings
      const hasDrawingsHeading = actionTexts.some(text => 
        /REVISIONS?\s+TO\s+DRAWINGS?/i.test(text) ||
        /REVISED\s+AND\s+RE\s*[-]\s*ISSUED/i.test(text)
      );
      expect(hasDrawingsHeading).toBe(false);
      
      // Should NOT contain numbered sheet items
      const hasSheetItems = actionTexts.some(text => 
        /^\d+\.\s*(SHEET\b|[A-Z]{1,3}\d)/i.test(text.trim())
      );
      expect(hasSheetItems).toBe(false);
    }
  });
  
  test('verb classification works for common action patterns', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Find section "23 02 00"
    const section230200 = instructionSet.specs.find(s => s.sectionIdNormalized === '23 02 00');
    expect(section230200).toBeDefined();
    
    if (section230200) {
      const actions = section230200.actions;
      
      // Should have at least one "delete" action (Delete "- NOT USED"...)
      const deleteActions = actions.filter(a => 
        a.verb === 'delete' && /delete/i.test(a.rawText)
      );
      expect(deleteActions.length).toBeGreaterThanOrEqual(1);
      
      // Should have at least one "add" action (Add Paragraph...)
      const addActions = actions.filter(a => 
        a.verb === 'add' && /add\s+paragraph/i.test(a.rawText.toLowerCase())
      );
      expect(addActions.length).toBeGreaterThanOrEqual(1);
    }
    
    // Find section "23 82 23"
    const section238223 = instructionSet.specs.find(s => s.sectionIdNormalized === '23 82 23');
    expect(section238223).toBeDefined();
    
    if (section238223) {
      const actions = section238223.actions;
      
      // Should have at least one "add" action (Insert a new Paragraph...)
      const insertActions = actions.filter(a => 
        a.verb === 'add' && /insert/i.test(a.rawText.toLowerCase())
      );
      expect(insertActions.length).toBeGreaterThanOrEqual(1);
      
      // Should have at least one "revise" action (Adjust the sequencing...)
      const adjustActions = actions.filter(a => 
        a.verb === 'revise' && /adjust/i.test(a.rawText.toLowerCase())
      );
      expect(adjustActions.length).toBeGreaterThanOrEqual(1);
    }
  });
  
  test('spec actions filter header/footer noise', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Find section "23 02 00"
    const section230200 = instructionSet.specs.find(s => s.sectionIdNormalized === '23 02 00');
    expect(section230200).toBeDefined();
    
    if (section230200) {
      const actionTexts = section230200.actions.map(a => a.rawText);
      
      // Should NOT contain header/footer noise
      const hasPageFooter = actionTexts.some(text => /^Page\s+\d+\s+of\s+\d+/i.test(text.trim()));
      expect(hasPageFooter).toBe(false);
      
      const hasAddendum = actionTexts.some(text => /^ADDENDUM\s+\d+/i.test(text.trim()));
      expect(hasAddendum).toBe(false);
      
      const hasProjectNo = actionTexts.some(text => 
        /Project\s+No\.?/i.test(text) || /RWB\s+Project\s+No/i.test(text)
      );
      expect(hasProjectNo).toBe(false);
      
      const hasFirmName = actionTexts.some(text => /RWB\s+Consulting\s+Engineers/i.test(text));
      expect(hasFirmName).toBe(false);
      
      // Should still have real actions
      expect(section230200.actions.length).toBeGreaterThan(0);
    }
    
    // Verify all spec sections have actions (no regressions)
    for (const spec of instructionSet.specs) {
      expect(spec.actions.length).toBeGreaterThan(0);
    }
  });
  
  test('drawing extraction remains stable after noise filtering', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    const instructionSet = parseNarrativeAlgorithmic(doc);
    
    // Verify drawings are still extracted
    expect(instructionSet.drawings.length).toBeGreaterThanOrEqual(1);
    
    // Verify at least one drawing has notes (to ensure notes capture still works)
    const drawingsWithNotes = instructionSet.drawings.filter(d => 
      d.notes && d.notes.length > 0
    );
    expect(drawingsWithNotes.length).toBeGreaterThanOrEqual(1);
    
    // Verify title cleanup (no leading dashes, trimmed)
    for (const drawing of instructionSet.drawings) {
      if (drawing.titleRaw) {
        expect(drawing.titleRaw).not.toMatch(/^[-–—]\s*/);
        expect(drawing.titleRaw).toBe(drawing.titleRaw.trim()); // No trailing whitespace
      }
    }
  });
});
