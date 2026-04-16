import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { BrandIcon } from "@/components/brand-icon"
import { useForm } from "react-hook-form"
import { z } from "zod"

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const handleLogin = (values: LoginFormValues) => {
    console.info("Login submitted", values)
  }

  return (
    <Card
      className={cn(
        "border-border/70 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.35)]",
        className
      )}
      {...props}
    >
      <CardHeader className="space-y-3 text-center">
        <a
          href="/auth"
          className="mx-auto inline-flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <BrandIcon className="size-5" />
          </span>
          Cuervo Planner
        </a>
        <div className="space-y-1">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to continue to your private workspace.
          </CardDescription>
        </div>
        <FieldDescription className="text-center">
          Don&apos;t have an account? <a href="/auth/signup">Create one</a>
        </FieldDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={handleSubmit(handleLogin)}>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                {...register("email")}
                id="email"
                type="email"
                autoComplete="email"
                placeholder="m@example.com"
                aria-invalid={!!errors.email}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <a href="#" className="text-xs font-medium text-primary hover:underline">
                  Forgot password?
                </a>
              </div>
              <Input
                {...register("password")}
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
              />
              <FieldError errors={[errors.password]} />
            </Field>

            <Field>
              <Button className="w-full" type="submit">
                Sign in
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
