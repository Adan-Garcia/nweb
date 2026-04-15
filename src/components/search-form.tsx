import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Label } from "@/components/ui/label"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from "@/components/ui/sidebar"
import { SearchIcon } from "lucide-react"

const searchSchema = z.object({
  query: z.string().min(1, "Enter a search term"),
})

type SearchFormValues = z.infer<typeof searchSchema>

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      query: "",
    },
  })

  const handleSearch = (values: SearchFormValues) => {
    console.info("Search submitted", values)
  }

  return (
    <form {...props} noValidate onSubmit={handleSubmit(handleSearch)}>
      <SidebarGroup className="py-0">
        <SidebarGroupContent className="relative">
          <Label htmlFor="search" className="sr-only">
            Search
          </Label>
          <SidebarInput
            {...register("query")}
            id="search"
            placeholder="Search the docs..."
            className="pl-8"
            aria-invalid={!!errors.query}
          />
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none" />
          {errors.query?.message ? (
            <p className="mt-2 text-xs text-destructive">{errors.query.message}</p>
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>
    </form>
  )
}
