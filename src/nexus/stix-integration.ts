export type StixType = 
  | "attack-pattern" | "campaign" | "course-of-action" | "grouping"
  | "identity" | "indicator" | "infrastructure" | "intrusion-set"
  | "location" | "malware" | "malware-analysis" | "note"
  | "observed-data" | "opinion" | "report" | "threat-actor"
  | "tool" | "vulnerability" | "relationship" | "sighting"
  | "extension-definition" | "bundle";

export interface StixObject {
  type: StixType;
  spec_version: "2.1";
  id: string;
  created_by_ref?: string;
  created: string;
  modified?: string;
  revoked?: boolean;
  labels?: string[];
  confidence?: number;
  lang?: string;
  external_references?: StixExternalReference[];
  object_marking_refs?: string[];
  granular_markings?: StixGranularMarking[];
  extensions?: Record<string, unknown>;
}

export interface StixExternalReference {
  source_name: string;
  description?: string;
  url?: string;
  hashes?: Record<string, string>;
  external_id?: string;
}

export interface StixGranularMarking {
  marking_ref: string;
  selectors: string[];
}

export interface StixBundle {
  type: "bundle";
  id: string;
  objects: StixObject[];
}

export interface StixIdentity extends StixObject {
  type: "identity";
  name: string;
  description?: string;
  roles?: string[];
  identity_class: "individual" | "group" | "system" | "organization" | "class" | "unknown";
  sectors?: string[];
  contact_information?: string;
}

export interface StixIndicator extends StixObject {
  type: "indicator";
  name?: string;
  description?: string;
  indicator_types?: ("anomalous-activity" | "anonymization" | "benign" | "compromised" | 
    "malicious-activity" | "attribution" | "unknown")[];
  pattern: string;
  pattern_type: "stix" | "pcre" | "sigma" | "snort" | "suricata" | "yara" | "spl" | "tlp";
  pattern_version?: string;
  valid_from: string;
  valid_until?: string;
  kill_chain_phases?: StixKillChainPhase[];
}

export interface StixLocation extends StixObject {
  type: "location";
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  precision?: number;
  region?: string;
  country?: string;
  administrative_area?: string;
  city?: string;
  street_address?: string;
  postal_code?: string;
}

export interface StixThreatActor extends StixObject {
  type: "threat-actor";
  name: string;
  description?: string;
  threat_actor_types?: ("activist" | "competitor" | "crime-syndicate" | "criminal" | 
    "hacker" | "insider-accidental" | "insider-disgruntled" | "nation-state" | 
    "sensationalist" | "spy" | "terrorist" | "unknown")[];
  aliases?: string[];
  first_seen?: string;
  last_seen?: string;
  roles?: ("agent" | "director" | "independent" | "infrastructure-architect" | 
    "infrastructure-operator" | "malware-author" | "sponsor")[];
  goals?: string[];
  sophistication?: ("none" | "minimal" | "intermediate" | "advanced" | "expert" | "innovator" | "strategic");
  resource_level?: ("individual" | "club" | "contest" | "team" | "organization" | "government");
  primary_motivation?: string;
  secondary_motivations?: string[];
  personal_motivations?: string[];
}

export interface StixRelationship extends StixObject {
  type: "relationship";
  relationship_type: string;
  description?: string;
  source_ref: string;
  target_ref: string;
  start_time?: string;
  stop_time?: string;
}

export interface StixObservedData extends StixObject {
  type: "observed-data";
  first_observed: string;
  last_observed: string;
  number_observed: number;
  object_refs: string[];
}

export interface StixReport extends StixObject {
  type: "report";
  name: string;
  description?: string;
  report_types?: ("attack-pattern" | "campaign" | "identity" | "indicator" | 
    "intrusion-set" | "malware" | "threat-actor" | "threat-report" | 
    "vulnerability" | "vulnerability-report")[];
  published: string;
  object_refs: string[];
}

export interface StixKillChainPhase {
  kill_chain_name: string;
  phase_name: string;
}

export interface StixSighting extends StixObject {
  type: "sighting";
  first_seen?: string;
  last_seen?: string;
  count?: number;
  sighting_of_ref: string;
  observed_data_refs?: string[];
  where_sighted_refs?: string[];
  summary?: boolean;
}

export class StixMapper {
  private objects: Map<string, StixObject> = new Map();

  generateId(type: StixType): string {
    return `${type}--${crypto.randomUUID()}`;
  }

  createIdentity(data: {
    name: string;
    identity_class: StixIdentity["identity_class"];
    description?: string;
    sectors?: string[];
    contact?: string;
  }): StixIdentity {
    const id = this.generateId("identity");
    const now = new Date().toISOString();

    const identity: StixIdentity = {
      type: "identity",
      spec_version: "2.1",
      id,
      created: now,
      modified: now,
      name: data.name,
      description: data.description,
      identity_class: data.identity_class,
      sectors: data.sectors,
      contact_information: data.contact,
      confidence: 85,
    };

    this.objects.set(id, identity);
    return identity;
  }

  createLocation(data: {
    name?: string;
    description?: string;
    lat?: number;
    lng?: number;
    country?: string;
    region?: string;
    city?: string;
  }): StixLocation {
    const id = this.generateId("location");
    const now = new Date().toISOString();

    const location: StixLocation = {
      type: "location",
      spec_version: "2.1",
      id,
      created: now,
      modified: now,
      name: data.name,
      description: data.description,
      latitude: data.lat,
      longitude: data.lng,
      country: data.country,
      region: data.region,
      city: data.city,
      confidence: 80,
    };

    this.objects.set(id, location);
    return location;
  }

  createIndicator(data: {
    name?: string;
    description?: string;
    pattern: string;
    pattern_type?: StixIndicator["pattern_type"];
    indicator_types?: StixIndicator["indicator_types"];
    valid_from?: Date;
    valid_until?: Date;
  }): StixIndicator {
    const id = this.generateId("indicator");
    const now = new Date().toISOString();

    const indicator: StixIndicator = {
      type: "indicator",
      spec_version: "2.1",
      id,
      created: now,
      modified: now,
      name: data.name,
      description: data.description,
      pattern: data.pattern,
      pattern_type: data.pattern_type ?? "stix",
      valid_from: (data.valid_from ?? new Date()).toISOString(),
      valid_until: data.valid_until?.toISOString(),
      indicator_types: data.indicator_types ?? ["anomalous-activity"],
      confidence: 75,
    };

    this.objects.set(id, indicator);
    return indicator;
  }

  createThreatActor(data: {
    name: string;
    description?: string;
    types?: StixThreatActor["threat_actor_types"];
    aliases?: string[];
    sophistication?: StixThreatActor["sophistication"];
    resource_level?: StixThreatActor["resource_level"];
    primary_motivation?: string;
  }): StixThreatActor {
    const id = this.generateId("threat-actor");
    const now = new Date().toISOString();

    const actor: StixThreatActor = {
      type: "threat-actor",
      spec_version: "2.1",
      id,
      created: now,
      modified: now,
      name: data.name,
      description: data.description,
      threat_actor_types: data.types ?? ["unknown"],
      aliases: data.aliases,
      sophistication: data.sophistication,
      resource_level: data.resource_level,
      primary_motivation: data.primary_motivation,
      confidence: 70,
    };

    this.objects.set(id, actor);
    return actor;
  }

  createRelationship(data: {
    source_ref: string;
    target_ref: string;
    relationship_type: string;
    description?: string;
    start_time?: Date;
    stop_time?: Date;
  }): StixRelationship {
    const id = this.generateId("relationship");
    const now = new Date().toISOString();

    const relationship: StixRelationship = {
      type: "relationship",
      spec_version: "2.1",
      id,
      created: now,
      modified: now,
      relationship_type: data.relationship_type,
      description: data.description,
      source_ref: data.source_ref,
      target_ref: data.target_ref,
      start_time: data.start_time?.toISOString(),
      stop_time: data.stop_time?.toISOString(),
      confidence: 70,
    };

    this.objects.set(id, relationship);
    return relationship;
  }

  createReport(data: {
    name: string;
    description?: string;
    published: Date;
    object_refs: string[];
    report_types?: StixReport["report_types"];
  }): StixReport {
    const id = this.generateId("report");
    const now = new Date().toISOString();

    const report: StixReport = {
      type: "report",
      spec_version: "2.1",
      id,
      created: now,
      modified: now,
      name: data.name,
      description: data.description,
      published: data.published.toISOString(),
      object_refs: data.object_refs,
      report_types: data.report_types ?? ["threat-report"],
      confidence: 80,
    };

    this.objects.set(id, report);
    return report;
  }

  createObservedData(data: {
    first_observed: Date;
    last_observed: Date;
    number_observed: number;
    object_refs: string[];
  }): StixObservedData {
    const id = this.generateId("observed-data");
    const now = new Date().toISOString();

    const observed: StixObservedData = {
      type: "observed-data",
      spec_version: "2.1",
      id,
      created: now,
      modified: now,
      first_observed: data.first_observed.toISOString(),
      last_observed: data.last_observed.toISOString(),
      number_observed: data.number_observed,
      object_refs: data.object_refs,
      confidence: 85,
    };

    this.objects.set(id, observed);
    return observed;
  }

  createSighting(data: {
    sighting_of_ref: string;
    first_seen?: Date;
    last_seen?: Date;
    count?: number;
    where_sighted_refs?: string[];
  }): StixSighting {
    const id = this.generateId("sighting");
    const now = new Date().toISOString();

    const sighting: StixSighting = {
      type: "sighting",
      spec_version: "2.1",
      id,
      created: now,
      modified: now,
      sighting_of_ref: data.sighting_of_ref,
      first_seen: data.first_seen?.toISOString(),
      last_seen: data.last_seen?.toISOString(),
      count: data.count,
      where_sighted_refs: data.where_sighted_refs,
      summary: false,
      confidence: 75,
    };

    this.objects.set(id, sighting);
    return sighting;
  }

  addExternalReference(obj: StixObject, ref: StixExternalReference): void {
    if (!obj.external_references) {
      obj.external_references = [];
    }
    obj.external_references.push(ref);
  }

  addKillChainPhase(indicator: StixIndicator, phases: StixKillChainPhase[]): void {
    indicator.kill_chain_phases = phases;
  }

  createBundle(objects?: StixObject[]): StixBundle {
    const id = this.generateId("bundle");
    return {
      type: "bundle",
      id,
      objects: objects ?? Array.from(this.objects.values()),
    };
  }

  getObject(id: string): StixObject | undefined {
    return this.objects.get(id);
  }

  getAllObjects(): StixObject[] {
    return Array.from(this.objects.values());
  }

  clear(): void {
    this.objects.clear();
  }

  exportJSON(pretty = false): string {
    const bundle = this.createBundle();
    return JSON.stringify(bundle, null, pretty ? 2 : 0);
  }

  importJSON(json: string): StixBundle {
    const bundle = JSON.parse(json) as StixBundle;
    if (bundle.type !== "bundle") {
      throw new Error("Invalid STIX bundle");
    }
    for (const obj of bundle.objects) {
      this.objects.set(obj.id, obj);
    }
    return bundle;
  }

  mapToMitreAttack(techniqueId: string): StixExternalReference {
    return {
      source_name: "MITRE ATT&CK",
      external_id: techniqueId,
      url: `https://attack.mitre.org/techniques/${techniqueId.replace(".", "/")}`,
    };
  }

  createAttackPattern(data: {
    name: string;
    technique_id: string;
    description?: string;
    kill_chain_phases?: StixKillChainPhase[];
  }): StixObject & { type: "attack-pattern" } {
    const id = this.generateId("attack-pattern");
    const now = new Date().toISOString();

    const attackPattern = {
      type: "attack-pattern" as const,
      spec_version: "2.1" as const,
      id,
      created: now,
      modified: now,
      name: data.name,
      description: data.description,
      kill_chain_phases: data.kill_chain_phases ?? [
        {
          kill_chain_name: "mitre-attack",
          phase_name: data.technique_id.split(".")[0],
        },
      ],
      external_references: [this.mapToMitreAttack(data.technique_id)],
      confidence: 85,
    };

    this.objects.set(id, attackPattern);
    return attackPattern;
  }
}

import type { NexusEvent, NexusSignal } from "./types";

export function convertEventToStix(event: NexusEvent): StixBundle {
  const mapper = new StixMapper();

  const location = mapper.createLocation({
    name: event.zone,
    lat: event.lat,
    lng: event.lng,
    country: event.country,
  });

  const indicator = mapper.createIndicator({
    name: `${event.category} - ${event.zone}`,
    description: event.aiSummary,
    pattern: `[ event-id = '${event.id}' ]`,
    pattern_type: "stix",
    indicator_types: event.level >= 7 ? ["malicious-activity"] : ["anomalous-activity"],
  });

  const sighting = mapper.createSighting({
    sighting_of_ref: indicator.id,
    first_seen: event.detectedAt,
    last_seen: event.updatedAt,
    count: event.signals.length,
    where_sighted_refs: [location.id],
  });

  const report = mapper.createReport({
    name: `NEXUS Report - ${event.id}`,
    description: event.explanation,
    published: event.detectedAt,
    object_refs: [location.id, indicator.id, sighting.id],
    report_types: ["threat-report"],
  });

  for (const signal of event.signals) {
    const signalIndicator = mapper.createIndicator({
      name: `Signal from ${signal.source}`,
      description: signal.description,
      pattern: `[ source = '${signal.source}' ]`,
      pattern_type: "stix",
    });

    mapper.createRelationship({
      source_ref: indicator.id,
      target_ref: signalIndicator.id,
      relationship_type: "indicates",
    });

    report.object_refs.push(signalIndicator.id);
  }

  return mapper.createBundle();
}

export function convertSignalToStix(signal: NexusSignal): StixBundle {
  const mapper = new StixMapper();

  const location = mapper.createLocation({
    lat: signal.lat,
    lng: signal.lng,
  });

  const indicator = mapper.createIndicator({
    name: `Signal: ${signal.source}`,
    description: signal.description,
    pattern: `[ source = '${signal.source}' ]`,
    pattern_type: "stix",
    indicator_types: ["anomalous-activity"],
  });

  const observed = mapper.createObservedData({
    first_observed: signal.eventTime,
    last_observed: signal.eventTime,
    number_observed: 1,
    object_refs: [indicator.id, location.id],
  });

  return mapper.createBundle([location, indicator, observed]);
}

export const stixMapper = new StixMapper();
