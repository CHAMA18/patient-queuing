import { db } from "@/lib/db";
import { STAGES, Stage } from "@/lib/queue";

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helpers
// ---------------------------------------------------------------------------
let s = 42;
function rnd(): number {
  s = (s * 1664525 + 1013904223) % 4294967296;
  return s / 4294967296;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(min + rnd() * (max - min + 1));
}

const FEMALE = ["Esther", "Mary", "Ruth", "Grace", "Chisomo", "Taonga", "Lumbani", "Mwaka", "Natasha", "Bupe", "Chimwemwe", "Dalitso", "Mwansa", "Kondwani", "Tendai", "Yezi", "Choolwe", "Mazuba", "Nsofu", "Likando", "Chanda", "Mutale", "Chilufya", "Kapula", "Mwangala", "Chisha", "Mwiinga", "Sibongile", "Namakau", "Kanema"];
const KIDS = ["Baby Joseph", "Baby Chanda", "Baby Luka", "Baby Mulenga", "Baby Musa", "Baby Talia", "Baby Sibu", "Baby Kangwa", "Baby Nkole", "Baby Wezi"];
const SURNAMES = ["Banda", "Mwansa", "Phiri", "Zulu", "Chanda", "Kabwe", "Mulenga", "Ngoma", "Tembo", "Mwape", "Daka", "Chirwa", "Lungu", "Sakala", "Mvula", "Kalaba", "Hara", "Moyo", "Nyirenda", "Bwalya", "Zimba", "Mwila", "Nkhoma", "Chama", "Chipulu", "Nalumango", "Shula", "Siatwinda", "Makondo"];
const STREETS = ["Kabwe", "Chilenje", "Matero", "Kalingalinga", "Chawama", "Libala", "Mandevu", "Woodlands", "Rhodes Park", "Northmead"];

const IRON = { drug: "Iron Supplements (Ferrous Sulphate)", dose: "200mg", freq: "1x daily", duration: "30 days" };
const FOLIC = { drug: "Folic Acid", dose: "5mg", freq: "1x daily", duration: "30 days" };
const CALCIUM = { drug: "Calcium Lactate", dose: "600mg", freq: "2x daily", duration: "21 days" };
const PARACET = { drug: "Paracetamol", dose: "500mg", freq: "3x daily", duration: "5 days" };

let seedPromise: Promise<void> | null = null;

export function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((e) => {
      seedPromise = null;
      throw e;
    });
  }
  return seedPromise;
}

// Force a fresh seed run (used after a demo-data wipe)
export function ensureSeedRaw(): Promise<void> {
  seedPromise = doSeed();
  return seedPromise;
}

async function doSeed(): Promise<void> {
  const existing = await db.setting.findUnique({ where: { key: "seedVersion" } });
  if (existing) return;

  const now = Date.now();
  const min = 60000;
  const ago = (m: number) => new Date(now - m * min);

  // ---------------- staff ----------------
  const staff: Array<{ name: string; role: string; station: string; room?: string }> = [
    { name: "Sister Mary Mutale", role: "Charge Nurse / Administrator", station: "VITALS" },
    { name: "Nurse P. Tembo", role: "Triage Nurse", station: "VITALS", room: "vitals-2" },
    { name: "Nurse G. Chirwa", role: "Triage Nurse", station: "VITALS", room: "vitals-1" },
    { name: "Nurse M. Phiri", role: "Triage Nurse", station: "VITALS", room: "vitals-3" },
    { name: "Clerk E. Hara", role: "Reception Clerk", station: "REGISTRATION" },
    { name: "Clerk R. Moyo", role: "Reception Clerk", station: "REGISTRATION" },
    { name: "Clerk S. Nyirenda", role: "Reception Clerk", station: "REGISTRATION" },
    { name: "Clerk T. Bwalya", role: "Reception Clerk", station: "REGISTRATION" },
    { name: "Dr. F. Phiri", role: "Doctor", station: "CONSULTATION", room: "consult-01" },
    { name: "Dr. K. Mwape", role: "Doctor", station: "CONSULTATION", room: "consult-02" },
    { name: "Dr. J. Banda", role: "Doctor", station: "CONSULTATION", room: "consult-03" },
    { name: "Dr. C. Zulu", role: "Doctor", station: "CONSULTATION", room: "consult-04" },
    { name: "Dr. A. Mwale", role: "Doctor", station: "CONSULTATION", room: "consult-05" },
    { name: "Sonographer C. Mwila", role: "Sonographer", station: "CONSULTATION", room: "sono-1" },
    { name: "Dr. H. Sinkala", role: "Doctor (Review)", station: "REVIEW", room: "consult-01" },
    { name: "Dr. M. Nonde", role: "Doctor (Review)", station: "REVIEW" },
    { name: "Tech L. Chanda", role: "Lab Technician", station: "LAB", room: "lab-1" },
    { name: "Tech M. Nkhoma", role: "Lab Technician", station: "LAB", room: "lab-2" },
    { name: "Pharm Tech B. Zimba", role: "Pharmacy Technician", station: "PHARMACY", room: "pharm-1" },
    { name: "Pharm Tech G. Phiri", role: "Pharmacy Technician", station: "PHARMACY", room: "pharm-2" },
    { name: "Pharm Tech D. Lungu", role: "Pharmacy Technician", station: "PHARMACY" },
  ];
  for (const st of staff) {
    await db.staff.create({ data: st });
  }

  // ---------------- settings ----------------
  const settings: Array<[string, string]> = [
    ["hospitalName", "Lusaka Central Hospital"],
    ["wing", "Maternity & Pediatric Wing"],
    ["station", "Triage Lead"],
    ["ward", "Main Maternity Wing"],
    ["targetWaitMin", "20"],
    ["consultTargetMin", "24"],
    ["wardOccupancyPct", "74"],
    ["wardCBedCapPct", "92"],
    ["uptimePct", "99.98"],
    ["solarPct", "100"],
    ["coldChainC", "4.2"],
    ["journeyVelocity", "3.2"],
    ["overflowOpen", "false"],
    ["seedVersion", "1"],
  ];
  for (const [key, value] of settings) {
    await db.setting.create({ data: { key, value } });
  }

  // ---------------- patient plan ----------------
  type P = {
    ticket: string;
    name: string;
    age: number;
    phone: string;
    address: string;
    visitType: string;
    trimester: string | null;
    gestationWk: number | null;
    stage: Stage;
    status: "WAITING" | "IN_SERVICE" | "COMPLETED";
    roomId: string | null;
    lounge: string | null;
    seat: string | null;
    priority: "ROUTINE" | "URGENT" | "RED";
    createdAt: Date;
    stageEnteredAt: Date;
    completedAt?: Date | null;
    registeredBy?: string;
    featured?: boolean;
  };

  function basePatient(over: Partial<P>): P {
    const name = over.name ?? (over.visitType === "PAEDIATRIC" ? pick(KIDS) : `${pick(FEMALE)} ${pick(SURNAMES)}`);
    const visitType = over.visitType ?? pick(["ANTENATAL", "ANTENATAL", "ANTENATAL", "ANTENATAL", "ANTENATAL", "ANTENATAL", "POSTNATAL", "PAEDIATRIC", "PAEDIATRIC", "ULTRASOUND", "GENERAL"]);
    let trimester = over.trimester ?? null;
    let gestationWk = over.gestationWk ?? null;
    if (visitType === "ANTENATAL" && trimester === null) {
      const t = pick(["First", "First", "Second", "Second", "Third", "Third", "Second"]);
      trimester = t;
      gestationWk = t === "First" ? randInt(8, 13) : t === "Second" ? randInt(14, 27) : randInt(28, 39);
    }
    const age = over.age ?? (visitType === "PAEDIATRIC" ? randInt(0, 5) : randInt(18, 42));
    return {
      name,
      age,
      phone: `+260 9${randInt(5, 7)}${randInt(10, 99)} ${randInt(1000, 9999)}`,
      address: `${pick(STREETS)}, Lusaka`,
      visitType,
      trimester,
      gestationWk,
      stage: "REGISTRATION",
      status: "WAITING",
      roomId: null,
      lounge: pick(["Lounge A", "Lounge A", "Lounge B", "Lounge C"]),
      seat: String(randInt(1, 30)),
      priority: "ROUTINE",
      createdAt: ago(120),
      stageEnteredAt: ago(10),
      ...over,
    } as P;
  }

  // --- Featured patients (exact mockup scenario) ---
  const featured: P[] = [
    basePatient({
      ticket: "MC-015", name: "Chimwemwe Phiri", age: 28, visitType: "ANTENATAL", trimester: "Third", gestationWk: 33,
      stage: "CONSULTATION", status: "IN_SERVICE", roomId: "consult-03", lounge: "Lounge B", seat: "8",
      priority: "URGENT", createdAt: ago(128), stageEnteredAt: ago(42), featured: true,
    }),
    basePatient({
      ticket: "MC-018", name: "Ruth Zimba", age: 24, visitType: "ANTENATAL", trimester: "Second", gestationWk: 22,
      stage: "REVIEW", status: "IN_SERVICE", roomId: "consult-01", lounge: "Lounge B", seat: "3",
      priority: "ROUTINE", createdAt: ago(95), stageEnteredAt: ago(6), featured: true,
    }),
    basePatient({
      ticket: "MC-019", name: "Taonga Banda", age: 31, visitType: "ULTRASOUND",
      stage: "REVIEW", status: "WAITING", roomId: null, lounge: "Lounge C", seat: "21",
      priority: "ROUTINE", createdAt: ago(85), stageEnteredAt: ago(11), featured: true,
    }),
    basePatient({
      ticket: "MC-020", name: "Esther Mwansa & Neonate", age: 26, visitType: "POSTNATAL",
      stage: "VITALS", status: "IN_SERVICE", roomId: "vitals-2", lounge: null, seat: null,
      priority: "RED", createdAt: ago(18), stageEnteredAt: ago(3), featured: true,
    }),
    basePatient({
      ticket: "MC-022", name: "Mary Kalaba", age: 27, visitType: "ANTENATAL", trimester: "Second", gestationWk: 26,
      stage: "COMPLETED", status: "COMPLETED", roomId: "pharm-1", lounge: "Lounge A", seat: "5",
      priority: "ROUTINE", createdAt: ago(49), stageEnteredAt: ago(6), completedAt: ago(5), featured: true,
    }),
    basePatient({
      ticket: "MC-024", name: "Grace Mwansa", age: 22, visitType: "ANTENATAL", trimester: "Second", gestationWk: 28,
      stage: "CONSULTATION", status: "WAITING", roomId: "consult-02", lounge: "Lounge A", seat: "2",
      priority: "ROUTINE", createdAt: ago(38), stageEnteredAt: ago(1), featured: true,
    }),
    basePatient({
      ticket: "MC-025", name: "Natasha Chirwa", age: 19, visitType: "ANTENATAL", trimester: "First", gestationWk: 11,
      stage: "REGISTRATION", status: "WAITING", roomId: null, lounge: "Lounge A", seat: "14",
      priority: "ROUTINE", createdAt: ago(7), stageEnteredAt: ago(7), registeredBy: "Clerk E. Hara", featured: true,
    }),
  ];

  // --- Bulk patients: 177 more (total 184 registered today) ---
  // Completed 113 (114 total incl. MC-022) • Waiting 42 (6/9/12/8/3/4) • In-service 28 (6/10/4/4/4) incl. MC-015 & MC-020
  const bulk: P[] = [];
  for (let i = 0; i < 113; i++) {
    const created = ago(randInt(70, 250));
    const wait = 8 + randInt(0, 14); // avg ~15m wait to vitals completion
    const extra = 24 + randInt(0, 22); // service + pharmacy time
    const completedAt = new Date(created.getTime() + (wait + extra) * min);
    bulk.push(basePatient({
      stage: "COMPLETED", status: "COMPLETED",
      createdAt: created, stageEnteredAt: new Date(created.getTime() + wait * min),
      completedAt: completedAt < ago(2) ? completedAt : ago(randInt(3, 9)),
    }));
  }
  const waitingPlan: Array<{ stage: Stage; n: number; maxWait: number; consultRooms?: boolean }> = [
    { stage: "REGISTRATION", n: 5, maxWait: 18 },  // + MC-025 = 6 waiting at reception
    { stage: "VITALS", n: 9, maxWait: 20 },        // 9 waiting (MC-020 is in-service here)
    { stage: "CONSULTATION", n: 11, maxWait: 22, consultRooms: true }, // + MC-024 = 12 waiting
    { stage: "LAB", n: 8, maxWait: 24 },           // lab = longest queue (24m)
    { stage: "REVIEW", n: 2, maxWait: 12 },        // + MC-019 = 3 waiting
    { stage: "PHARMACY", n: 4, maxWait: 15 },
  ];
  const waitingRooms = ["consult-01", "consult-02", "consult-03", "consult-04", "consult-05", null, null, null, null, null, null, null];
  let roomIdx = 0;
  for (const w of waitingPlan) {
    for (let i = 0; i < w.n; i++) {
      const wait = randInt(3, w.maxWait);
      bulk.push(basePatient({
        stage: w.stage, status: "WAITING",
        roomId: w.consultRooms ? waitingRooms[roomIdx++ % waitingRooms.length] : null,
        createdAt: ago(wait + randInt(10, 45)), stageEnteredAt: ago(wait),
      }));
    }
  }
  const inServicePlan: Array<{ stage: Stage; n: number; rooms: string[] }> = [
    { stage: "VITALS", n: 5, rooms: ["vitals-1", "vitals-1", "vitals-2", "vitals-3", "vitals-3"] }, // + MC-020 = 6
    { stage: "CONSULTATION", n: 9, rooms: ["consult-01", "consult-02", "consult-03", "consult-04", "consult-05", "sono-1", "consult-05", "consult-04", "sono-1"] }, // + MC-015 = 10
    { stage: "LAB", n: 4, rooms: ["lab-1", "lab-1", "lab-2", "lab-2"] },
    { stage: "REVIEW", n: 3, rooms: ["consult-01", "consult-01", "consult-02"] }, // + MC-018 = 4
    { stage: "PHARMACY", n: 4, rooms: ["pharm-1", "pharm-1", "pharm-2", "pharm-2"] },
  ];
  for (const w of inServicePlan) {
    for (let i = 0; i < w.n; i++) {
      bulk.push(basePatient({
        stage: w.stage, status: "IN_SERVICE", roomId: w.rooms[i % w.rooms.length],
        createdAt: ago(randInt(30, 110)), stageEnteredAt: ago(randInt(3, 14)),
      }));
    }
  }

  // ---------------- assign tickets (unique, MC-001..MC-184) ----------------
  const all = [...featured, ...bulk];
  const usedTickets = new Set(featured.map((p) => p.ticket));
  const pool: number[] = [];
  for (let i = 1; i <= 184; i++) {
    const t = `MC-${String(i).padStart(3, "0")}`;
    if (!usedTickets.has(t)) pool.push(t);
  }
  let pi = 0;
  for (const p of all) {
    if (p.featured) continue;
    p.ticket = pool[pi++];
  }

  // ---------------- write patients + clinical records ----------------
  const allNames = [...FEMALE, ...SURNAMES];
  const eventsToCreate: Array<{ patientTicket: string | null; ev: { type: string; title: string; detail?: string; meta?: string; at: Date } }> = [];
  const idByTicket = new Map<string, string>();

  for (const p of all) {
    const created = await db.patient.create({
      data: {
        ticket: p.ticket, name: p.name, age: p.age, phone: p.phone, address: p.address,
        visitType: p.visitType, trimester: p.trimester, gestationWk: p.gestationWk,
        lounge: p.lounge, seat: p.seat, priority: p.priority,
        stage: p.stage, status: p.status, roomId: p.roomId,
        stageEnteredAt: p.stageEnteredAt,
        registeredBy: p.registeredBy ?? pick(["Clerk E. Hara", "Clerk R. Moyo", "Clerk S. Nyirenda", "Clerk T. Bwalya"]),
        completedAt: p.completedAt ?? null,
        createdAt: p.createdAt, updatedAt: p.createdAt,
      },
    });
    idByTicket.set(p.ticket, created.id);

    const typeLabel = p.visitType === "ANTENATAL"
      ? `Antenatal${p.trimester ? ` ${p.trimester} Trimester${p.gestationWk ? ` (${p.gestationWk}w)` : ""}` : ""}`
      : p.visitType === "PAEDIATRIC" ? "Child Wellness Intake"
      : p.visitType === "POSTNATAL" ? "Mother & Baby Postnatal Intake"
      : p.visitType === "ULTRASOUND" ? "Sonography Booking"
      : "General OPD Intake";

    eventsToCreate.push({
      patientTicket: p.ticket,
      ev: {
        type: "REGISTER",
        title: "Registered at OPD Reception",
        detail: `Assigned Ticket ${p.ticket} • New Mother Intake (${typeLabel})${p.lounge ? ` • ${p.lounge} Seat ${p.seat}` : ""}`,
        meta: JSON.stringify({ lounge: p.lounge, seat: p.seat }),
        at: p.createdAt,
      },
    });

    const throughVitals = p.status === "COMPLETED" || ["CONSULTATION", "LAB", "REVIEW", "PHARMACY", "COMPLETED"].includes(p.stage);

    if (p.ticket !== "MC-020" && throughVitals) {
      await db.vitals.create({
        data: {
          patientId: created.id,
          systolic: randInt(102, 132), diastolic: randInt(64, 84),
          weightKg: randInt(52, 88), tempC: Math.round((36.4 + rnd() * 0.7) * 10) / 10,
          pulseBpm: randInt(72, 96), fetalBpm: p.visitType === "ANTENATAL" ? randInt(138, 152) : null,
          recordedBy: pick(["Nurse P. Tembo", "Nurse G. Chirwa", "Nurse M. Phiri"]),
          createdAt: p.createdAt,
        },
      });
      eventsToCreate.push({
        patientTicket: p.ticket,
        ev: {
          type: "VITALS_DONE",
          title: "Vitals Completed → Consultation Queue",
          detail: `Triage normal • Routed onward by ${pick(["Nurse P. Tembo", "Nurse G. Chirwa", "Nurse M. Phiri"])}`,
          at: new Date(Math.min(p.createdAt.getTime() + randInt(6, 20) * min, now - 2 * min)),
        },
      });
    }

    if (["LAB", "REVIEW", "PHARMACY", "COMPLETED"].includes(p.stage)) {
      const done = ["REVIEW", "PHARMACY", "COMPLETED"].includes(p.stage);
      await db.labTest.create({
        data: {
          patientId: created.id,
          panel: pick(["Complete Haemogram", "Urinalysis", "Hb Level", "Blood Group & Rhesus", "Malaria RDT"]),
          status: done ? "READY" : p.status === "IN_SERVICE" ? "PROCESSING" : "PENDING",
          orderedBy: pick(["Dr. K. Mwape", "Dr. J. Banda", "Dr. F. Phiri"]),
          resultSummary: done ? pick(["Normal ranges", "Mild anaemia — iron therapy advised", "No malarial parasites seen", "Unremarkable"]) : null,
          createdAt: p.createdAt, completedAt: done ? p.stageEnteredAt : null,
        },
      });
    }

    if (p.status === "COMPLETED" || p.stage === "PHARMACY") {
      const dispensed = p.status === "COMPLETED";
      const items = p.ticket === "MC-022" ? [IRON, FOLIC] : pick([[IRON, FOLIC], [IRON, FOLIC, CALCIUM], [PARACET], [IRON, CALCIUM], [FOLIC, PARACET]]);
      await db.prescription.create({
        data: {
          patientId: created.id,
          items: JSON.stringify(items),
          prescribedBy: pick(["Dr. K. Mwape", "Dr. J. Banda", "Dr. F. Phiri", "Dr. C. Zulu"]),
          dispensed,
          dispensedAt: dispensed ? new Date((p.completedAt ?? p.createdAt).getTime() - 2 * min) : null,
          handedOverBy: dispensed ? pick(["Pharm Tech B. Zimba", "Pharm Tech G. Phiri", "Pharm Tech D. Lungu"]) : null,
        },
      });
      if (!dispensed) continue;
      const dwell = Math.round(((p.completedAt ?? p.createdAt).getTime() - p.createdAt.getTime()) / min);
      eventsToCreate.push({
        patientTicket: p.ticket,
        ev: {
          type: "DISPENSED",
          title: p.ticket === "MC-022" ? "Prescriptions Dispensed" : "Prescriptions Dispensed",
          detail: p.ticket === "MC-022"
            ? "Handover Confirmed • Iron Supplements & Folic Acid • Visit Marked Completed"
            : `Handover Confirmed • ${items.map((i) => i.drug.split(" (")[0]).join(" & ")} • Visit Marked Completed`,
          meta: JSON.stringify(p.ticket === "MC-022" ? { tag: "Discharged Happy", extra: "Dwell: 44m total" } : { tag: "Discharged", extra: `Dwell: ${dwell}m total` }),
          at: p.completedAt ?? p.createdAt,
        },
      });
      eventsToCreate.push({
        patientTicket: p.ticket,
        ev: {
          type: "COMPLETED",
          title: "Visit Completed",
          detail: `Total dwell ${dwell}m • Discharged`,
          at: p.completedAt ?? p.createdAt,
        },
      });
    }
  }

  // ---------------- featured clinical detail ----------------
  const mc020id = idByTicket.get("MC-020");
  if (mc020id) {
    await db.vitals.create({
      data: {
        patientId: mc020id, systolic: 158, diastolic: 98, weightKg: 71.4, tempC: 38.9,
        pulseBpm: 108, fetalBpm: null,
        notes: "Elevated maternal BP with accompanying neonate fever (38.9°C). Expedited consultation pathway required.",
        flagged: true, recordedBy: "Nurse P. Tembo", createdAt: ago(3),
      },
    });
  }
  const mc018id = idByTicket.get("MC-018");
  if (mc018id) {
    const lt = await db.labTest.findFirst({ where: { patientId: mc018id } });
    if (lt) {
      await db.labTest.update({
        where: { id: lt.id },
        data: { panel: "Complete Haemogram", status: "READY", completedAt: ago(8), resultSummary: "Hb 10.2 g/dL — mild anaemia, iron therapy advised" },
      });
    }
  }

  // ---------------- alert + movement events for the feed ----------------
  eventsToCreate.push({
    patientTicket: "MC-020",
    ev: {
      type: "ALERT",
      title: "Urgent Triage Alert: Mother & Neonate Priority Flag",
      detail: "Elevated maternal BP (158/98) in Vitals Bay 2 with accompanying neonate fever (38.9°C). Immediate expedited consultation pathway suggested.",
      meta: JSON.stringify({ kind: "triage", location: "Vitals Station 2", flaggedBy: "Nurse P. Tembo" }),
      at: ago(3),
    },
  });
  eventsToCreate.push({
    patientTicket: null,
    ev: {
      type: "ALERT",
      title: "Specimen Lab Centrifuge 02 Routine Calibration",
      detail: "Diagnostics running single-channel while Unit 02 completes thermal diagnostic cycle. Causing queue accumulation of 8 expecting mothers.",
      meta: JSON.stringify({ kind: "centrifuge", etaMin: 12, impacted: "Antenatal Routine Screen", resolved: false }),
      at: ago(22),
    },
  });
  eventsToCreate.push({
    patientTicket: "MC-024",
    ev: {
      type: "MOVE",
      title: "Vitals Completed → Room 02",
      detail: "Assigned to Dr. K. Mwape • Priority Routine Antenatal 28w check",
      meta: JSON.stringify({ tag: "Transition Smooth", gate: "Lounge A" }),
      at: ago(1),
    },
  });
  eventsToCreate.push({
    patientTicket: "MC-018",
    ev: {
      type: "LAB_READY",
      title: "Lab Results Ready → Recalled",
      detail: "Automated return routing to Consultation Room 01 • Complete Haemogram uploaded",
      meta: JSON.stringify({ tag: "Return Case", extra: "SMS Alert Triggered" }),
      at: ago(3),
    },
  });
  eventsToCreate.push({
    patientTicket: "MC-019",
    ev: {
      type: "MOVE",
      title: "Ultrasound Completed",
      detail: "Sonography Bay 1 • Growth scan verified with Sonographer C. Mwila",
      meta: JSON.stringify({ tag: "Awaiting Midwife", gate: "Lounge C" }),
      at: ago(11),
    },
  });
  eventsToCreate.push({
    patientTicket: "MC-015",
    ev: {
      type: "CONSULT_START",
      title: "Consultation Started — Room 03",
      detail: "Dr. J. Banda with Patient MC-015 (Complex twin presentation discussion)",
      at: ago(42),
    },
  });

  for (const e of eventsToCreate) {
    await db.event.create({
      data: {
        patientId: e.patientTicket ? idByTicket.get(e.patientTicket) ?? null : null,
        ticket: e.patientTicket, type: e.ev.type, title: e.ev.title,
        detail: e.ev.detail ?? null, meta: e.ev.meta ?? null, createdAt: e.ev.at,
      },
    });
  }
}
