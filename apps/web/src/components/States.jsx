import { Link } from 'react-router';

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="rounded-[10px] border border-line p-6 flex flex-col gap-3 items-start">
      <p className="m-0 font-semibold">Le chargement a échoué.</p>
      <p className="m-0 text-grey">{error?.message}</p>
      {onRetry && <button type="button" className="btn btn-ghost" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-[10px] border border-dashed border-ctl p-8 flex flex-col gap-3 items-start">
      <p className="m-0 font-semibold text-lg">{title}</p>
      {children && <p className="m-0 text-grey max-w-[60ch]">{children}</p>}
      {action}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-[10px] border border-line bg-night overflow-hidden">
      <div className="aspect-[4/3] bg-ink-2" />
      <div className="p-4 flex flex-col gap-3">
        <div className="h-4 w-3/4 rounded bg-line" />
        <div className="h-16 rounded bg-ink-2" />
        <div className="h-5 w-1/2 rounded bg-line" />
        <div className="h-11 rounded bg-ink-2" />
      </div>
    </div>
  );
}

export function NotFoundBlock({ title = 'Page introuvable', text = "L'adresse ne correspond à aucune page du site." }) {
  return (
    <div className="flex flex-col gap-5 items-start py-16">
      <h1 className="text-[clamp(31px,4vw,49px)]">{title}</h1>
      <p className="m-0 text-grey max-w-[52ch]">{text}</p>
      <div className="flex gap-3 flex-wrap">
        <Link className="btn btn-primary" to="/catalogue">Voir le catalogue</Link>
        <Link className="btn btn-ghost" to="/">Retour à l'accueil</Link>
      </div>
    </div>
  );
}
