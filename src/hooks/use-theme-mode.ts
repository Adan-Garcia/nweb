import { useEffect, useState } from "react"

function getInitialIsDark() {
	const savedTheme = window.localStorage.getItem("theme")
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches

	return savedTheme === "dark" || (!savedTheme && prefersDark)
}

export function useThemeMode() {
	const [isDark, setIsDark] = useState(getInitialIsDark)

	useEffect(() => {
		document.documentElement.classList.toggle("dark", isDark)
	}, [isDark])

	const toggleTheme = () => {
		const nextIsDark = !isDark
		setIsDark(nextIsDark)
		window.localStorage.setItem("theme", nextIsDark ? "dark" : "light")
	}

	return { isDark, toggleTheme }
}
