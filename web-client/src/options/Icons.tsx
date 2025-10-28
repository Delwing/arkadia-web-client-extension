import { forwardRef, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export const DeleteIcon = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M6 6l12 12M6 18L18 6" />
    </svg>
));
DeleteIcon.displayName = "DeleteIcon";

export const EditIcon = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M4 20h4l10.5-10.5a2 2 0 0 0-2.828-2.828L5.172 17.172 4 20z" />
        <path d="M13.5 6.5l4 4" />
    </svg>
));
EditIcon.displayName = "EditIcon";
