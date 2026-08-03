interface ProfileTabPlaceholderProps {
  title: string;
  description?: string;
}

/** Empty public-safe shell for profile tabs until later slices fill them. */
export function ProfileTabPlaceholder({
  title,
  description = 'Nothing here yet.',
}: ProfileTabPlaceholderProps) {
  return (
    <section className="mt-10 text-left">
      <h2 className="type-page-lg text-foreground">{title}</h2>
      <p className="mt-2 text-muted">{description}</p>
    </section>
  );
}
