import { useEffect, useState } from "react"

export function useThemeMode() {
	const [isDark, setIsDark] = useState(false)

	useEffect(() => {
		const savedTheme = window.localStorage.getItem("theme")
		const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
		const shouldUseDark = savedTheme === "dark" || (!savedTheme && prefersDark)

		setIsDark(shouldUseDark)
		document.documentElement.classList.toggle("dark", shouldUseDark)
	}, [])

	const toggleTheme = () => {
		const nextIsDark = !isDark
		setIsDark(nextIsDark)
		document.documentElement.classList.toggle("dark", nextIsDark)
		window.localStorage.setItem("theme", nextIsDark ? "dark" : "light")
	}

	return { isDark, toggleTheme }
}