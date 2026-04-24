interface SpriteIconProps {
    name: string;
    size?: number;
    className?: string;
    alt?: string;
}

export const SpriteIcon = ({ name, size = 24, className = '', alt = '' }: SpriteIconProps) => (
    <img
        src={`/sprites/${name}.png`}
        alt={alt}
        width={size}
        height={size}
        className={`inline-block object-contain ${className}`}
        draggable={false}
    />
);
