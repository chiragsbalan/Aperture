interface ProfileTabPlaceholderProps {
  /** Optional; omit when ProfileNav already names the active tab. */
  title?: string;
  description?: string;
}

/** Empty public-safe shell for profile tabs until later slices fill them. */
export function ProfileTabPlaceholder({
  title,
  description = 'Nothing here yet.',
}: ProfileTabPlaceholderProps) {
  return (
    <section className="mt-10 text-left">
      {title != null && title !== '' ? (
        <h2 className="type-page-lg text-foreground">{title}</h2>
      ) : null}
      <p
        className={
          title != null && title !== '' ? 'mt-2 text-muted' : 'text-muted'
        }
      >
        {description}
      </p>
    </section>
  );
}
