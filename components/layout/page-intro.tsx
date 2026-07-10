type PageIntroProps = {
  description: string;
};

export function PageIntro({ description }: PageIntroProps) {
  return (
    <div className="animate-enter">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
