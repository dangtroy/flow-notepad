import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          // A genuinely floating layer, so it carries the one shadow token.
          toast:
            "group toast group-[.toaster]:rounded-md group-[.toaster]:bg-surface group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-float",
          description: "group-[.toast]:text-muted-foreground",
          // Undo and any count read in the machine voice.
          actionButton:
            "group-[.toast]:rounded-md group-[.toast]:bg-primary group-[.toast]:font-mono group-[.toast]:text-micro group-[.toast]:tracking-[0.01em] group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-md group-[.toast]:bg-muted group-[.toast]:font-mono group-[.toast]:text-micro group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
