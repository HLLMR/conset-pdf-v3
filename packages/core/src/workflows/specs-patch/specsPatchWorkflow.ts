/**
 * Specs patch workflow implementation
 */

import type {
  InventoryResult,
  ExecuteResult,
  CorrectionOverlay,
} from '../types.js';
import type { WorkflowImpl } from '../engine.js';
import type { SpecsPatchAnalyzeInput, SpecsPatchExecuteInput } from './types.js';
import { DocumentContext } from '../../analyze/documentContext.js';
import { detectSections, convertToSpecSections } from '../../specs/extract/sectionDetector.js';
import { extractTextNodes } from '../../specs/extract/textExtractor.js';
import { generateBookmarkTree } from '../../specs/extract/bookmarkTreeGenerator.js';
import { normalizeSpecsMasterformat } from '../../standards/normalizeSpecsMasterformat.js';
import { getIssueMessage } from './issueMessages.js';
import { validatePatch } from '../../specs/patch/validator.js';
import { applyPatch } from '../../specs/patch/apply.js';
import { readJson, writeJson } from '../../utils/fs.js';
import { generateHtml, loadCssTemplate } from '../../specs/render/htmlGenerator.js';
import type { SpecDoc, SpecNode } from '../../specs/ast/types.js';
import type { SpecPatch, SpecPatchOperation } from '../../specs/patch/types.js';

/**
 * Specs patch workflow implementation
 */
export const specsPatchWorkflowImpl: WorkflowImpl<
  SpecsPatchAnalyzeInput,
  SpecsPatchAnalyzeInput,
  SpecsPatchExecuteInput
> = {
  /**
   * Analyze spec PDF and produce inventory result
   * Must NOT write output files - this is a dry-run operation
   */
  async analyze(input: SpecsPatchAnalyzeInput): Promise<InventoryResult> {
    const { inputPdfPath, customSectionPattern } = input;
    
    // Load PDF via DocumentContext
    const docContext = new DocumentContext(inputPdfPath);
    await docContext.initialize();
    
    // Detect sections (three-phase grammar)
    const detectedSections = await detectSections(docContext, customSectionPattern);
    const sections = convertToSpecSections(detectedSections);
    
    // Extract text nodes for each section
    for (const section of sections) {
      const nodes = await extractTextNodes(docContext, section);
      section.content = nodes;
      
      // Add MasterFormat metadata
      const masterFormat = normalizeSpecsMasterformat({ normalizedId: section.sectionId });
      if (masterFormat.confidence > 0.5) {
        section.masterFormat = masterFormat;
      }
    }
    
    // Build SpecDoc AST
    const specDoc: SpecDoc = {
      meta: {
        sourcePdfPath: inputPdfPath,
        extractedAt: new Date().toISOString(),
        pageCount: docContext.pageCount,
        sectionCount: sections.length,
      },
      sections,
    };
    
    // Generate BookmarkAnchorTree
    const bookmarkTree = generateBookmarkTree(specDoc);
    
    // Generate issues
    const issues: InventoryResult['issues'] = [];
    if (sections.length === 0) {
      issues.push({
        id: 'no-sections',
        severity: 'error',
        code: 'NO_SECTION_HEADER',
        message: 'No section headers detected in PDF',
        rowIds: [],
      });
    }
    
    // Collect issues from nodes
    let issueIdCounter = 0;
    const rowIdsWithIssues = new Set<string>();
    for (const section of sections) {
      for (const node of section.content) {
        if (node.issues && node.issues.length > 0) {
          for (const issueCode of node.issues) {
            const issueId = `issue-${issueIdCounter++}`;
            rowIdsWithIssues.add(node.id);
            
            let severity: 'error' | 'warning' | 'info' = 'warning';
            if (issueCode === 'ANCHOR_REQUIRED' || issueCode === 'DUPLICATE_ANCHOR') {
              severity = 'error';
            }
            
            issues.push({
              id: issueId,
              severity,
              code: issueCode,
              message: getIssueMessage(issueCode, node),
              rowIds: [node.id],
            });
          }
        }
      }
    }
    
    // Map nodes to inventory rows (one row per node)
    const rows: InventoryResult['rows'] = [];
    for (const section of sections) {
      for (const node of section.content) {
        const hasIssues = node.issues && node.issues.length > 0;
        const hasError = node.issues?.some(code => 
          code === 'ANCHOR_REQUIRED' || code === 'DUPLICATE_ANCHOR'
        ) || false;
        
        rows.push({
          id: node.id,
          source: inputPdfPath,
          page: node.page,
          status: hasError ? 'error' : hasIssues ? 'warning' : 'ok',
          confidence: node.confidence,
          action: 'extract',
          notes: node.anchor ? `Anchor: ${node.anchor}` : 'No anchor',
          tags: node.type === 'list-item' ? ['list-item'] : node.type === 'heading' ? ['heading'] : [],
        });
      }
    }
    
    // Calculate summary
    const rowsWithAnchors = rows.filter(r => {
      const node = sections.flatMap(s => s.content).find(n => n.id === r.id);
      return node?.anchor !== null;
    }).length;
    
    const rowsOk = rows.filter(r => r.status === 'ok').length;
    const rowsWarning = rows.filter(r => r.status === 'warning').length;
    const rowsError = rows.filter(r => r.status === 'error').length;
    
    return {
      workflowId: 'specs-patch',
      rows,
      issues,
      conflicts: [],
      summary: {
        totalRows: rows.length,
        rowsWithIds: rowsWithAnchors,
        rowsWithoutIds: rows.length - rowsWithAnchors,
        rowsOk,
        rowsWarning,
        rowsError,
        rowsConflict: 0,
        issuesCount: issues.length,
        conflictsCount: 0,
        sectionsExtracted: sections.length,
        nodesExtracted: rows.length,
      },
      meta: {
        specDoc,
        bookmarkTree,
      },
    };
  },

  /**
   * Apply corrections overlay to inventory
   * Re-runs analyze() and applies corrections to the result
   */
  async applyCorrections(
    input: SpecsPatchAnalyzeInput,
    _inventory: InventoryResult,
    corrections: CorrectionOverlay
  ): Promise<InventoryResult> {
    // Start with fresh analysis (re-run analyze to get clean state)
    const freshInventory = await this.analyze(input);
    
    // Get AST from meta
    const specDoc = freshInventory.meta?.specDoc as SpecDoc | undefined;
    if (!specDoc) {
      return freshInventory;
    }
    
    // Load patches from corrections overlay
    let patches: SpecPatchOperation[] = [];
    
    if (corrections.patchPath) {
      // Load patch from file
      const patchDoc = await readJson<SpecPatch>(corrections.patchPath);
      patches = patchDoc.operations;
    } else if (corrections.patches) {
      // Use inline patches
      patches = corrections.patches as SpecPatchOperation[];
    }
    
    if (patches.length === 0) {
      // No patches to apply, return inventory unchanged
      return freshInventory;
    }
    
    // Validate patches
    const validation = validatePatch({ meta: { version: '1.0', createdAt: new Date().toISOString() }, operations: patches }, specDoc);
    
    if (!validation.valid) {
      // Generate issues from validation errors
      const issues = freshInventory.issues || [];
      for (const error of validation.errors) {
        issues.push({
          id: `patch-validation-${error.operationIndex}`,
          severity: 'error',
          code: error.code,
          message: error.message,
          rowIds: [],
        });
      }
      
      return {
        ...freshInventory,
        issues,
        summary: {
          ...freshInventory.summary,
          issuesCount: issues.length,
          rowsError: freshInventory.summary.rowsError + validation.errors.length,
        },
      };
    }
    
    // Apply patches
    const patchedDoc = applyPatch(specDoc, patches);
    
    // Regenerate bookmark tree from patched AST
    const bookmarkTree = generateBookmarkTree(patchedDoc);
    
    // Re-validate AST (check for duplicate anchors, broken numbering)
    const revalidationIssues: InventoryResult['issues'] = [];
    for (const section of patchedDoc.sections) {
      const anchorMap = new Map<string, SpecNode[]>();
      for (const node of section.content) {
        if (node.anchor) {
          if (!anchorMap.has(node.anchor)) {
            anchorMap.set(node.anchor, []);
          }
          anchorMap.get(node.anchor)!.push(node);
        }
      }
      
      // Check for duplicates
      for (const [anchor, nodes] of anchorMap.entries()) {
        if (nodes.length > 1) {
          revalidationIssues.push({
            id: `duplicate-anchor-${anchor}`,
            severity: 'error',
            code: 'DUPLICATE_ANCHOR',
            message: `Duplicate anchor "${anchor}" found after patch application`,
            rowIds: nodes.map(n => n.id),
          });
        }
      }
    }
    
    // Update inventory with patched AST
    const updatedRows = patchedDoc.sections.flatMap(section =>
      section.content.map(node => ({
        id: node.id,
        source: input.inputPdfPath,
        page: node.page,
        status: (node.issues && node.issues.length > 0) ? 'warning' as const : 'ok' as const,
        confidence: node.confidence,
        action: 'extract',
        notes: node.anchor ? `Anchor: ${node.anchor}` : 'No anchor',
        tags: node.type === 'list-item' ? ['list-item'] : node.type === 'heading' ? ['heading'] : [],
      }))
    );
    
    return {
      ...freshInventory,
      rows: updatedRows,
      issues: [...(freshInventory.issues || []), ...revalidationIssues],
      summary: {
        ...freshInventory.summary,
        issuesCount: (freshInventory.issues?.length || 0) + revalidationIssues.length,
        rowsError: revalidationIssues.length > 0 ? revalidationIssues.length : freshInventory.summary.rowsError,
      },
      meta: {
        ...freshInventory.meta,
        specDoc: patchedDoc,
        bookmarkTree,
      },
    };
  },

  /**
   * Execute the workflow
   * Produces output files and returns execution result
   */
  async execute(input: SpecsPatchExecuteInput): Promise<ExecuteResult> {
    const { inputPdfPath, outputPdfPath, patchPath, patch, options = {} } = input;
    
    // Load corrected AST from analyzed input or re-extract
    let specDoc: SpecDoc;
    if (input.analyzed?.ast) {
      specDoc = input.analyzed.ast as SpecDoc;
    } else {
      // Re-extract
      const inventory = await this.analyze({ inputPdfPath, options: { verbose: options.verbose } });
      specDoc = inventory.meta?.specDoc as SpecDoc;
      if (!specDoc) {
        return {
          outputs: {
            outputPdfPath,
          },
          summary: {
            success: false,
          },
          errors: ['Failed to extract AST from PDF'],
        };
      }
    }
    
    // Apply patches if provided
    let patchesApplied = 0;
    const auditTrail: {
      patchesApplied: SpecPatchOperation[];
      changes: Array<{ type: string; anchor?: string; description: string }>;
      issues: string[];
    } = {
      patchesApplied: [],
      changes: [],
      issues: [],
    };
    
    if (patchPath || patch || input.corrections?.patches || input.corrections?.patchPath) {
      let patches: SpecPatchOperation[] = [];
      
      if (input.corrections?.patchPath) {
        const patchDoc = await readJson<SpecPatch>(input.corrections.patchPath);
        patches = patchDoc.operations;
      } else if (input.corrections?.patches) {
        patches = input.corrections.patches as SpecPatchOperation[];
      } else if (patchPath) {
        const patchDoc = await readJson<SpecPatch>(patchPath);
        patches = patchDoc.operations;
      } else if (patch) {
        const patchDoc = patch as SpecPatch;
        patches = patchDoc.operations;
      }
      
      if (patches.length > 0) {
        // Validate patches
        const validation = validatePatch(
          { meta: { version: '1.0', createdAt: new Date().toISOString() }, operations: patches },
          specDoc
        );
        
        if (!validation.valid) {
          return {
            outputs: {
              outputPdfPath,
            },
            summary: {
              success: false,
              patchesApplied: 0,
            },
            errors: validation.errors.map(e => e.message),
          };
        }
        
        // Apply patches
        specDoc = applyPatch(specDoc, patches);
        patchesApplied = patches.length;
        auditTrail.patchesApplied = patches;
        
        // Track changes (simplified - would track actual node changes in full implementation)
        for (const op of patches) {
          auditTrail.changes.push({
            type: op.op,
            anchor: 'targetAnchor' in op ? op.targetAnchor : 'startAnchor' in op ? op.startAnchor : undefined,
            description: `Applied ${op.op} operation`,
          });
        }
      }
    }
    
    // Generate HTML from AST
    const cssTemplate = await loadCssTemplate();
    const html = generateHtml(specDoc, cssTemplate);
    
    // Render HTML to PDF
    const { renderHtmlToPdf } = await import('../../specs/render/pdfRenderer.js');
    await renderHtmlToPdf(html, outputPdfPath);
    
    // Generate audit trail JSON
    const bookmarkTree = generateBookmarkTree(specDoc);
    const auditTrailJson = {
      patchesApplied: auditTrail.patchesApplied,
      changes: auditTrail.changes,
      issues: auditTrail.issues,
      bookmarkTree,
      specDoc,
    };
    
    // Write output files
    const outputs: Record<string, string> = {
      outputPdfPath,
    };
    
    if (options.jsonOutputPath) {
      await writeJson(options.jsonOutputPath, specDoc);
      outputs.astJsonPath = options.jsonOutputPath;
    }
    
    if (options.reportPath) {
      await writeJson(options.reportPath, auditTrailJson);
      outputs.reportPath = options.reportPath;
    }
    
    // Count pages (estimate from sections)
    const pagesRendered = specDoc.sections.reduce((sum, section) => sum + (section.endPage - section.startPage + 1), 0);
    
    return {
      outputs,
      summary: {
        success: true,
        sectionsExtracted: specDoc.sections.length,
        nodesExtracted: specDoc.sections.reduce((sum, s) => sum + s.content.length, 0),
        patchesApplied,
        pagesRendered,
        issuesCount: 0,
      },
    };
  },
};
