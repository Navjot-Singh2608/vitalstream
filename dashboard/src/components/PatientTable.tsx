import { useEffect, useMemo, useState } from 'react';
import { isAbnormal, RISK_RANK, VITALS } from '../lib/clinical';
import { useDashboard, type PatientState } from '../store/vitalStore';
import type { VitalKey } from '../types/contracts';
import { RiskBadge } from './status';

type Tab = 'all' | 'risk';

const VITAL_COLUMNS: VitalKey[] = ['hr', 'spo2', 'sbp', 'rr', 'temp'];
const PAGE_SIZE = 10; // patients per page

/** Every patient in one table. Two tabs: in bed order, or sickest first. */
export function PatientTable() {
  const patients = useDashboard((s) => s.patients);
  const order = useDashboard((s) => s.order);
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1); // which page we're on (1 = first)

  const rows = useMemo(() => {
    const list = order.map((id) => patients[id]).filter((p): p is PatientState => !!p);
    if (tab === 'all') return list; // bed order, as the backend sent it
    const score = (p: PatientState) => (p.latest ? RISK_RANK[p.latest.risk] * 100 + p.latest.news2 : -1);
    return [...list].sort((a, b) => score(b) - score(a)); // highest risk first
  }, [patients, order, tab]);

  // ---- Pagination: only show 10 rows at a time ----
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount); // e.g. patients removed: don't stay on an empty page
  const first = (safePage - 1) * PAGE_SIZE; // index of the first row on this page
  const pageRows = rows.slice(first, first + PAGE_SIZE);

  useEffect(() => setPage(1), [tab]); // switching tabs goes back to page 1

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
              {pageRows.map((p) => (
                <PatientRow key={p.info.id} p={p} />
              ))}
            </tbody>
          </table>
          {pageCount > 1 && (
            <Pagination
              page={safePage}
              pageCount={pageCount}
              first={first + 1}
              last={first + pageRows.length}
              total={rows.length}
              onChange={setPage}
            />
          )}
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

function Pagination(props: {
  page: number;
  pageCount: number;
  first: number;
  last: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const { page, pageCount, first, last, total, onChange } = props;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1); // [1, 2, 3, ...]
  return (
    <nav className="pager" aria-label="Patient pages">
      <span className="muted">
        Showing {first}–{last} of {total}
      </span>
      <div className="pager-buttons">
        <button onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page">
          ‹ Prev
        </button>
        {pages.map((n) => (
          <button key={n} className={n === page ? 'on' : ''} onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined}>
            {n}
          </button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page === pageCount} aria-label="Next page">
          Next ›
        </button>
      </div>
    </nav>
  );
}
