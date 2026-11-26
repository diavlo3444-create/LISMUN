export type AtlasSectionId =
  | 'hero'
  | 'about'
  | 'experience'
  | 'committees'
  | 'secretariat'
  | 'numbers'
  | 'registration'
  | 'apply';

export interface AtlasNavItem {
  id: AtlasSectionId;
  label: string;
  roman: string;
  coordinate: string;
}

export interface AtlasChapter {
  id: string;
  roman: string;
  regionLabel: string;
  title: string;
  subtitle: string;
  coordinates: string;
  lonLat: [number, number];
  zoomScale: number;
  body: string;
  caption: string;
}

export type ExperienceStageId = 'research' | 'debate' | 'diplomacy' | 'resolution';

export interface ExperienceStage {
  id: ExperienceStageId;
  index: string;
  roman: string;
  title: string;
  subtitle: string;
  quote: string;
  coordinate: string;
  folioCode: string;
  description: string;
  annotations: string[];
  archivalHeading: string;
  archivalNote: string;
}

export interface CommitteeNode {
  id: string;
  code: string;
  name: string;
  organ: string;
  city: string;
  coordinates: string;
  lonLat: [number, number];
  connectedTo: string[];
  mandate: string;
  agendaStatus: string;
  sessionProtocol: string;
  plateType: 'chamber' | 'treaty' | 'court' | 'council';
}

export interface SecretariatOffice {
  id: string;
  accessionCode: string;
  title: string;
  appointees: string;
  division: string;
  appointmentStatus: string;
  coordinates: string;
  portfolio: string;
  responsibilities: string[];
  motto: string;
}

export interface AtlasMetric {
  id: string;
  value: number | null;
  displayFallback: string;
  suffix?: string;
  romanLabel?: string;
  label: string;
  detail: string;
  verifiedNote: string;
}

export type DelegateTrack = 'individual' | 'delegation';

export interface RegistrationPayload {
  track: DelegateTrack;
  fullName: string;
  email: string;
  institution: string;
  countryOrCity: string;
  preferredCommitteeId: string;
  delegationSize: number;
  experienceLevel: 'First Session' | 'Experienced Delegate' | 'Faculty Advisor';
  motivationNote: string;
}

export interface RegistrationValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof RegistrationPayload, string>>;
}

export interface RegistrationReceipt {
  dossierCode: string;
  submittedAtIso: string;
  payload: RegistrationPayload;
}
