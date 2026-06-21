/**
 * Face Monitoring Types — Sprint 11
 * AI-powered face detection events for candidate behavior monitoring.
 */

export type FaceMonitoringEventType =
  | 'NO_FACE'
  | 'MULTIPLE_FACE'
  | 'FACE_AWAY';

export type FaceDirection = 'center' | 'left' | 'right' | 'down';

export interface FaceDetectionResult {
  faceCount: number;
  faceDirection: FaceDirection;
  isNoFace: boolean;
  isMultipleFaces: boolean;
  isFaceAway: boolean;
}

export interface FaceMonitoringConfig {
  /** Analysis interval in milliseconds (1000-1500 recommended) */
  analysisIntervalMs: number;
  /** Threshold for considering face direction as "away" (in degrees) */
  gazeThresholdDegrees: number;
  /** Enable/disable console logging */
  enableLogging: boolean;
}

export const DEFAULT_FACE_MONITORING_CONFIG: FaceMonitoringConfig = {
  analysisIntervalMs: 1200,
  gazeThresholdDegrees: 20,
  enableLogging: true,
};

export interface FaceMonitoringEvent {
  type: FaceMonitoringEventType;
  timestamp: Date;
  details: FaceDetectionResult;
}
