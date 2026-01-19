/**
 * Extended profile types for transcript-based extraction
 * 
 * Extends the existing LayoutProfile system to support:
 * - Spec profiles (section-based documents)
 * - Sheet template profiles (drawing templates)
 * - Equipment submittal profiles
 */

import type { LayoutProfile } from '../../layout/types.js';

/**
 * Bounding box in points (visual space)
 */
export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Outline level definition
 */
export interface OutlineLevel {
  /** Level number (1-6) */
  level: number;
  /** Regex pattern for matching headings at this level */
  pattern: string;
  /** Expected font size range */
  fontSizeRange?: [min: number, max: number];
  /** Whether this level is typically bold */
  isBold?: boolean;
}

/**
 * Table extraction strategy
 */
export interface TableStrategy {
  /** Strategy name/identifier */
  name: string;
  /** Method: 'geometry', 'pdfplumber', 'camelot' */
  method: 'geometry' | 'pdfplumber' | 'camelot';
  /** Region to search for tables */
  region?: BBox;
  /** Column detection hints */
  columnHints?: number[]; // X coordinates
}

/**
 * Spec profile for section-based specification documents
 */
export interface SpecProfile {
  /** Document type identifier */
  docType: 'spec';
  /** Profile version */
  profileVersion: string;
  /** Page model constraints */
  pageModel: {
    /** Common page size in points [width, height] */
    commonSize: [number, number];
    /** Allowed rotations */
    rotationAllowed: number[];
  };
  /** Page regions */
  regions: {
    /** Header band */
    header: BBox;
    /** Footer band */
    footer: BBox;
    /** Body band */
    body: BBox;
  };
  /** Outline structure */
  outline: {
    /** Heading level definitions */
    levels: OutlineLevel[];
  };
  /** Optional table extraction strategies */
  tables?: TableStrategy[];
  /** Confidence metrics */
  confidence: {
    /** Overall confidence (0.0-1.0) */
    overall: number;
    /** Notes about confidence assessment */
    notes: string[];
  };
}

/**
 * Schedule profile for table extraction
 */
export interface ScheduleProfile {
  /** Schedule identifier */
  scheduleId: string;
  /** Schedule name/description */
  name: string;
  /** Region where schedule appears */
  bbox: BBox;
  /** Column definitions */
  columns: Array<{
    /** Column name */
    name: string;
    /** X coordinate hint */
    x?: number;
    /** Data type hint */
    type?: 'text' | 'number' | 'date';
  }>;
  /** Extraction strategy */
  strategy: TableStrategy;
}

/**
 * Sheet template profile (extends LayoutProfile for drawings)
 */
export interface SheetTemplateProfile extends LayoutProfile {
  /** Document type identifier */
  docType: 'drawing';
  /** Title block configuration */
  titleBlock: {
    /** Title block bounding box */
    bbox: BBox;
    /** Field definitions */
    fields: {
      [fieldName: string]: {
        /** Regex pattern for field value */
        regex: string;
      };
    };
  };
  /** Standard blocks (revision block, notes, etc.) */
  standardBlocks: {
    [blockName: string]: {
      /** Block header text (for identification) */
      header: string;
      /** Block bounding box */
      bbox: BBox;
    };
  };
  /** Schedule definitions */
  schedules: ScheduleProfile[];
}

/**
 * Equipment submittal profile
 */
export interface EquipmentSubmittalProfile {
  /** Document type identifier */
  docType: 'equipmentSubmittal';
  /** Profile version */
  profileVersion: string;
  /** Unit structure patterns */
  unitStructure: {
    /** Pattern for cover block identification */
    coverBlockPattern: string;
    /** Pattern for unit report identification */
    unitReportPattern: string;
  };
  /** Header block ROIs with field definitions */
  headerBlockRois: {
    [fieldName: string]: {
      /** Regex pattern for field value */
      regex: string;
      /** Field bounding box */
      bbox: BBox;
    };
  };
  /** Table definitions for performance data */
  tableDefinitions: ScheduleProfile[];
}

/**
 * Union type for all profile types
 */
export type TemplateProfile = SpecProfile | SheetTemplateProfile | EquipmentSubmittalProfile;

/**
 * Profile metadata
 */
export interface ProfileMetadata {
  /** Profile identifier */
  profileId: string;
  /** Profile name */
  name: string;
  /** Profile version */
  version: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Source of profile */
  source: 'auto-detected' | 'manual' | 'user-defined' | 'ml-generated';
}
