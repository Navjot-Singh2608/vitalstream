import { useMemo, useState } from 'react';
import { isAbnormal, RISK_RANK, VITALS } from '../lib/clinical';
import { useDashboard, type PatientState } from '../store/vitalStore';
import type { VitalKey } from '../types/contracts';
import { RiskBadge } from './status';

type Tab = 'all' | 'risk';

const VITAL_COLUMNS: VitalKey[] = ['hr', 'spo2', 'sbp', 'rr', 'temp'];

/** Every patient in one table. Two tabs: in bed order, or sickest first. */
export function PatientTable() {
  const patients = useDashboard((s) => s.patients);
  const order = useDashboard((s) => s.order);
  const [tab, setTab] = useState<Tab>('all');

  const rows = useMemo(() => {
    const list = order.map((id) => patients[id]).filter((p): p is PatientState => !!p);
    if (tab === 'all') return list; // bed order, as the backend sent it
    const score = (p: PatientState) => (p.latest ? RISK_RANK[p.latest.risk] * 100 + p.latest.news2 : -1);
    return [...list].sort((a, b) => score(b) - score(a)); // highest risk first
  }, [patients, order, tab]);

  return (
    <section className="panel" aria-label="Patients">
      <div className="tabs" role="tablist" aria-label="Patient view">
        <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
          All patients <span className="count">{rows.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'risk'} className={tab === 'risk' ? 'on' : ''} onClick={() => setTab('risk')}>
          By risk
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No patients yet. Waiting for the patient list from the backend.</p>
      ) : (
        <div className="table-wrap">
          <table className="ptable">
            <thead>
              <tr>
                <th>Bed</th>
                <th>Patient</th>
                <th>Diagnosis</th>
                <th>Risk</th>
                {VITAL_COLUMNS.map((k) => (
                  <th key={k} className="num" title={`${VITALS[k].label} (${VITALS[k].unit})`}>
                    {VITALS[k].short}
                  </th>
                ))}
                <th className="num" title="NEWS2 early-warning score">NEWS2</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <PatientRow key={p.info.id} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PatientRow({ p }: { p: PatientState }) {
  const l = p.latest;
  return (
    <tr>
      <td className="mono">{p.info.bed}</td>
      <td>
        <span className="pname">{p.info.name}</span> <span className="muted">· {p.info.age}</span>
      </td>
      <td className="muted">{p.info.diagnosis}</td>
      <td>{l ? <RiskBadge risk={l.risk} /> : <span className="muted">—</span>}</td>
      {VITAL_COLUMNS.map((k) => {
        const v = l?.[k];
        const bad = v != null && isAbnormal(k, v);
        return (
          <td key={k} className={`num mono ${bad ? 'abn' : ''}`}>
            {v == null ? '—' : k === 'sbp' ? `${v}/${l?.dbp}` : v.toFixed(VITALS[k].decimals)}
            {bad && <span className="abn-mark" aria-label="out of range">▲</span>}
          </td>
        );
      })}
      <td className="num mono strong">{l?.news2 ?? '—'}</td>
    </tr>
  );
}
