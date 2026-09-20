import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { WorkspaceShell } from "./workspace-shell"

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} })
})

function setup(path = "/dashboard", onToggleTheme = vi.fn(), isDark = false) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceShell isDark={isDark} onToggleTheme={onToggleTheme}>
        <p>Page content</p>
      </WorkspaceShell>
    </MemoryRouter>,
  )
  return { onToggleTheme }
}

describe("WorkspaceShell", () => {
  it("renders the page inside the shell", () => {
    setup()
    expect(screen.getByText("Page content")).toBeInTheDocument()
  })

  it("links to the dashboard, calendar and notes", () => {
    setup()
    const nav = screen.getByText("Navigate").closest("[data-sidebar='group']") as HTMLElement

    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard")
    expect(within(nav).getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar")
    expect(within(nav).getByRole("link", { name: "Notes" })).toHaveAttribute("href", "/notes")
  })

  it.each([
    ["/dashboard", "Dashboard"],
    ["/calendar", "Calendar"],
    ["/notes", "Notes"],
  ])("marks only the current route's link as active at %s", (path, label) => {
    setup(path)
    const active = screen
      .getAllByRole("link")
      .filter((link) => link.hasAttribute("data-active"))

    expect(active).toHaveLength(1)
    expect(active[0]).toHaveTextContent(label)
  })

  it("marks nothing active on an unknown route", () => {
    setup("/somewhere-else")
    expect(screen.getAllByRole("link").filter((link) => link.hasAttribute("data-active"))).toHaveLength(0)
  })

  it("asks to toggle the theme, and labels the button for the mode it would switch to", async () => {
    const user = userEvent.setup()
    const { onToggleTheme } = setup("/dashboard", vi.fn(), true)

    await user.click(screen.getByRole("button", { name: "Switch to light mode" }))

    expect(onToggleTheme).toHaveBeenCalledOnce()
  })
})
