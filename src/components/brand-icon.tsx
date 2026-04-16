type BrandIconProps = {
	className?: string
}

export function BrandIcon({ className }: BrandIconProps) {
	return (
		<img
			src="/brand-mark.svg"
			alt=""
			aria-hidden="true"
			className={className}
		/>
	)
}