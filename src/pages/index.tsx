import { Button } from "@/components/ui/button";
import {
  MoonIcon,
  SunIcon,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BrandIcon } from "@/components/brand-icon";
import "../App.css";

export function IndexPage() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const shouldUseDark = savedTheme === "dark" || (!savedTheme && prefersDark);

    setIsDark(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  const handleToggleTheme = () => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    document.documentElement.classList.toggle("dark", nextIsDark);
    window.localStorage.setItem("theme", nextIsDark ? "dark" : "light");
  };
  const benefits = [
    {
      icon: <ShieldCheck className="size-4" />,
      title: "Private by default",
      copy: "Your wings stay locked to your account.",
    },
    {
      icon: <LockKeyhole className="size-4" />,
      title: "Fast syncing",
      copy: "Quickly sync your data across all your devices.",
    },
    {
      icon: <LockKeyhole className="size-4" />,
      title: "Open Source",
      copy: "Open Source, forever.",
    },
    {
      icon: <LockKeyhole className="size-4" />,
      title: "Free Beta",
      copy: "Free beta access till 2027.",
    },
    {
      icon: <LockKeyhole className="size-4" />,
      title: "Device Level Encryption",
      copy: "Your data is encrypted at the device level, ensuring maximum security.",
    },
    {
      icon: <LockKeyhole className="size-4" />,
      title: "Easy sharing",
      copy: "share your notes and homework with your friends, family, or classmates",
    },
    {
      icon: <LockKeyhole className="size-4" />,
      title: "Cross platform",
      copy: "Access Cuervo Planner on all your devices, seamlessly.",
    },
    {
      icon: <LockKeyhole className="size-4" />,
      title: "Offline first",
      copy: "Use Cuervo Planner even without an internet connection, your data will sync once you're back online.",
    },
  ];

  const benefitsClassName = "signin-points";
  const benefitClassName = "signin-point";
  const benefitBadgeClassName = "signin-point-badge";
  const benefitTitleClassName = "signin-point-title";
  const benefitCopyClassName = "signin-point-copy";
  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto relative max-w-6xl grid grid-cols-3 items-center px-4 py-4 sm:px-6 lg:px-8">
          <div className="max-h-10 flex items-center gap-2">
            {/* Mobile Nav */}
            <div className="flex md:hidden flex-1 justify-center">
              <details className="relative">
                <summary className="list-none cursor-pointer px-3 py-2 rounded-md border border-border bg-background shadow-sm flex items-center gap-2">
                  <span className="sr-only">Open menu</span>
                  <svg
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-6"
                  >
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </summary>
                <div className="absolute -translate-x-1 mt-2 w-40 rounded-md border border-border bg-background shadow-lg z-50 flex flex-col">
                  <a
                    href="#"
                    className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    About
                  </a>
                  <a
                    href="/documentation"
                    className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Documentation
                  </a>
                  <a
                    href="/pricing"
                    className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Pricing
                  </a>
                  <a
                    href="/privacy"
                    className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Privacy
                  </a>
                  <a
                    href="/calendar"
                    className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Calendar
                  </a>
                </div>
              </details>
            </div>
            <a
              href="#"
              className="inline-flex items-center gap-2 font-semibold"
            >
              <BrandIcon className="size-8" />
              <span>Cuervo Planner</span>
            </a>
          </div>
          {/* Center: Desktop Nav */}
          <div><nav className="hidden md:flex justify-center gap-8">
            <a
              href="#"
              className="text-sm font-medium text-foreground hover:text-primary"
            >
              About
            </a>
            <a
              href="/documentation"
              className="text-sm font-medium text-foreground hover:text-primary"
            >
              Documentation
            </a>
            <a
              href="/pricing"
              className="text-sm font-medium text-foreground hover:text-primary"
            >
              Pricing
            </a>
            <a
              href="/privacy"
              className="text-sm font-medium text-foreground hover:text-primary"
            >
              Privacy
            </a>
            <a
              href="/calendar"
              className="text-sm font-medium text-foreground hover:text-primary"
            >
              Calendar
            </a>
          </nav></div>
          {/* Right: Theme button & Mobile Nav */}
          <div className="flex items-center justify-end gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleTheme}
              aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
            >
              {isDark ? (
                <SunIcon className="size-4" />
              ) : (
                <MoonIcon className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-12">
          <div className="mb-8">
            <h1 className="mb-2 text-4xl font-bold">Cuervo Planner</h1>
            <p className="text-lg text-muted-foreground">
              A simple homework planner and note taking app built with privacy
              in mind. Create an account to keep your information encrypted and
              safe. Your data is stored locally on your device and never leaves
              it, for more information, see our{" "}
              <a href="/privacy" className="text-primary hover:underline">
                <b>privacy policy</b>
              </a>
            </p>
          </div>
        </div>
     <Button
        variant="default"
        //min size 2 rem, max size 4 rem
        style={{
          minHeight: "3rem",
          maxHeight: "8rem",
          minWidth: "12rem",
          maxWidth: "16rem",
          marginBottom: "2rem",
        }}
        type="button"
        className="mt-8 shadow-lg ring-4 ring-primary/30 hover:ring-primary/50 focus:ring-primary/50 active:ring-primary/50"
        onClick={() => (window.location.href = "/auth/")}
      >
        Get Started Now
      </Button>
      {benefits?.length ? (
        <div
          className={benefitsClassName}
          aria-label="Features and benefits of using Cuervo Planner"
        >
          {benefits.map((benefit) => (
            <div className={benefitClassName} key={benefit.title}>
              <span className={benefitBadgeClassName}>{benefit.icon}</span>
              <div>
                <p className={benefitTitleClassName}>{benefit.title}</p>
                <p className={benefitCopyClassName}>{benefit.copy}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
	  </div>
      
    </main>
  );
}
