/**
 * Public API Contract Tests
 * 
 * Ensures that public API exports exist and remain stable.
 * These tests verify the contract, not the implementation.
 */

import { describe, it, expect } from '@jest/globals';

describe('Public API Contracts', () => {
  describe('Schedule Extraction (Bucket A: Public + Supported)', () => {
    it('should export exportScheduleToCSV', async () => {
      const { exportScheduleToCSV } = await import('@conset-pdf/core');
      expect(typeof exportScheduleToCSV).toBe('function');
    });

    it('should export exportScheduleToJSON', async () => {
      const { exportScheduleToJSON } = await import('@conset-pdf/core');
      expect(typeof exportScheduleToJSON).toBe('function');
    });
  });

  describe('Submittal Parser (Bucket A: Public + Supported)', () => {
    it('should export extractPacketFields', async () => {
      const { extractPacketFields } = await import('@conset-pdf/core');
      expect(typeof extractPacketFields).toBe('function');
    });

    it('should export extractPacketTables', async () => {
      const { extractPacketTables } = await import('@conset-pdf/core');
      expect(typeof extractPacketTables).toBe('function');
    });
  });

  describe('Workflow Engine (Bucket B: Public + Advanced/Expert)', () => {
    it('should export createWorkflowRunner', async () => {
      const { createWorkflowRunner } = await import('@conset-pdf/core');
      expect(typeof createWorkflowRunner).toBe('function');
    });
  });

  describe('Transcript Extractors (Bucket B: Public + Advanced/Expert)', () => {
    it('should export PyMuPDFExtractor', async () => {
      const { PyMuPDFExtractor } = await import('@conset-pdf/core');
      expect(PyMuPDFExtractor).toBeDefined();
    });

    it('should export PDFjsExtractor', async () => {
      const { PDFjsExtractor } = await import('@conset-pdf/core');
      expect(PDFjsExtractor).toBeDefined();
    });

    it('should export isPyMuPDFAvailable', async () => {
      const { isPyMuPDFAvailable } = await import('@conset-pdf/core');
      expect(typeof isPyMuPDFAvailable).toBe('function');
    });

    it('should export isPDFjsAvailable', async () => {
      const { isPDFjsAvailable } = await import('@conset-pdf/core');
      expect(typeof isPDFjsAvailable).toBe('function');
    });
  });

  describe('Internal Utilities (Bucket C: Deprecated)', () => {
    it('should export preserveTokenShape (deprecated, remove in v2.0.0)', async () => {
      const { preserveTokenShape } = await import('@conset-pdf/core');
      expect(typeof preserveTokenShape).toBe('function');
      // Contract: must exist until v2.0.0 removal
    });
  });
});
