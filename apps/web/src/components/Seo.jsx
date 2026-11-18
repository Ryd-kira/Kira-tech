// React 19 place automatiquement <title> et <meta> dans le <head>.
const SITE = 'Kira Tech et Solution';

export default function Seo({ title, description, noindex = false }) {
  const full = title ? `${title} | ${SITE}` : `${SITE} : ordinateurs et matériel informatique à Cotonou et Calavi`;
  return (
    <>
      <title>{full}</title>
      {description && <meta name="description" content={description} />}
      <meta property="og:title" content={full} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content="website" />
      {noindex && <meta name="robots" content="noindex" />}
    </>
  );
}
