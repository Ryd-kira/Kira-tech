import { useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { Notice, PageHeader } from '../ui.jsx';

const ROLES = [['SUPER_ADMIN', 'Super administrateur'], ['ADMIN', 'Administrateur'], ['GESTIONNAIRE', 'Gestionnaire']];
const EDITABLE = ['ADMIN', 'GESTIONNAIRE'];
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

const draftOf = (v) => Object.fromEntries(EDITABLE.map((r) => [r, v.roles[r].permissions]));

export default function Roles() {
  const { data, error } = useApi('/admin/roles');
  if (error) return <Notice kind="error">{error.message}</Notice>;
  if (!data) return <p className="muted">Chargement…</p>;
  return <RolesEditor initial={data} />;
}

function RolesEditor({ initial }) {
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState(() => draftOf(initial));
  const [state, setState] = useState({});

  const groups = useMemo(() => {
    const out = new Map();
    for (const p of view?.catalog ?? []) out.set(p.group, [...(out.get(p.group) ?? []), p]);
    return [...out];
  }, [view]);

  const dirty = EDITABLE.filter((r) => !sameSet(draft[r], view.roles[r].permissions));
  const toggle = (role, code) => {
    setState({});
    setDraft((d) => ({ ...d, [role]: d[role].includes(code) ? d[role].filter((p) => p !== code) : [...d[role], code] }));
  };
  const resetToDefaults = (role) => { setState({}); setDraft((d) => ({ ...d, [role]: view.roles[role].defaults.filter((p) => !view.catalog.find((c) => c.code === p)?.locked) })); };

  async function save() {
    setState({ busy: true });
    try {
      let next = view;
      for (const role of dirty) {
        next = await api(`/admin/roles/${role}`, { method: 'PUT', body: { permissions: draft[role] } });
        // Ce qui est enregistré devient la référence, même si le rôle suivant échoue.
        setView(next);
      }
      setDraft(draftOf(next));
      setState({ ok: true });
    } catch (err) {
      setState({ error: err });
    }
  }

  return (
    <div className="max-w-[1000px] flex flex-col gap-4">
      <PageHeader title="Rôles et permissions"
        subtitle="Choisissez ce que chaque rôle peut voir et faire. Le changement s'applique à tous les comptes du rôle en moins d'une minute, sans reconnexion."
        actions={<button type="button" className="btn btn-primary" disabled={!dirty.length || state.busy} onClick={save}>{state.busy ? 'Enregistrement…' : 'Enregistrer les permissions'}</button>} />
      {state.ok && <Notice kind="success">Permissions enregistrées. Chaque changement est inscrit au journal d'activité.</Notice>}
      {state.error && <Notice kind="error">{state.error.message}</Notice>}
      {dirty.length > 0 && !state.busy && <Notice kind="warning">Modifications non enregistrées pour : {dirty.map((r) => ROLES.find(([k]) => k === r)[1]).join(', ')}.</Notice>}

      <div className="panel overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th className="w-full">Permission</th>
              {ROLES.map(([k, label]) => <th key={k} scope="col" className="text-center">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, perms]) => [
              <tr key={group}><th colSpan={4} scope="colgroup" className="!pt-5 !text-[#090D16] !text-sm bg-[#FAFBFD]">{group}</th></tr>,
              ...perms.map((p) => (
                <tr key={p.code}>
                  <td>
                    <span className="block">{p.label}</span>
                    {p.locked && <span className="block text-[12px] muted">Toujours réservé au super administrateur.</span>}
                  </td>
                  {ROLES.map(([role, roleLabel]) => {
                    const editable = role !== 'SUPER_ADMIN' && !p.locked;
                    const checked = role === 'SUPER_ADMIN' ? true : draft[role].includes(p.code);
                    const changed = editable && checked !== view.roles[role].defaults.includes(p.code);
                    return (
                      <td key={role} className="text-center">
                        <label className="inline-flex flex-col items-center gap-0.5 min-h-11 justify-center cursor-pointer">
                          <input type="checkbox" className="size-[18px] accent-[#176BFF]" checked={checked} disabled={!editable}
                            onChange={() => toggle(role, p.code)} aria-label={`${roleLabel} : ${p.label}`} />
                          {changed && <span className="text-[11px] font-semibold text-[#0F5BE0]">modifié</span>}
                        </label>
                      </td>
                    );
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {EDITABLE.map((role) => (
          <button key={role} type="button" className="btn btn-ghost" onClick={() => resetToDefaults(role)}>
            Valeurs par défaut : {ROLES.find(([k]) => k === role)[1].toLowerCase()}
          </button>
        ))}
      </div>
      <p className="muted text-sm m-0">« modifié » signale une différence avec les valeurs prévues à l'origine pour le rôle. Les menus de l'administration suivent ces permissions : une rubrique sans permission n'apparaît pas.</p>
    </div>
  );
}
