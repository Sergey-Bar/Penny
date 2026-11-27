import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,scale] duration-100 ease-out [-webkit-tap-highlight-color:transparent] enabled:active:scale-[0.97] motion-reduce:enabled:active:scale-100 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Each variant has its own hover, pressed and selected (aria-pressed / data-pressed) step; disabled and
        // keyboard focus are shared above. Pressed is a colour step as well as a scale, so it reads with motion off.
        default: "bg-primary text-primary-foreground hover:bg-brand-hover active:bg-brand-press",
        outline:
          "border border-interactive bg-card hover:bg-hover active:bg-press aria-pressed:border-primary aria-pressed:bg-selection aria-pressed:text-strong",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-press active:bg-press aria-pressed:bg-selection aria-pressed:text-strong",
        ghost: "hover:bg-hover active:bg-press aria-pressed:bg-selection aria-pressed:text-strong",
        destructive:
          "bg-destructive text-destructive-foreground hover:brightness-95 active:brightness-90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        xs: "h-11 rounded-full px-3 text-xs",
        sm: "h-11 rounded-full px-4",
        lg: "h-11 rounded-full px-6",
        icon: "size-11",
        "icon-xs": "size-11 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-11",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
