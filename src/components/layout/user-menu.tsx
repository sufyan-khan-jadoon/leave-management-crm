"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/lib/constants";
import { initialsOf } from "@/lib/utils";

type UserMenuProps = {
  name: string;
  email: string;
  image?: string | null;
  isAdmin: boolean;
};

export function UserMenu({ name, email, image, isAdmin }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Account menu">
          <Avatar className="size-7">
            {image && <AvatarImage src={image} alt="" />}
            <AvatarFallback>{initialsOf(name)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-medium">{name}</span>
          <span className="text-muted-foreground block truncate text-xs">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {!isAdmin && (
          <DropdownMenuItem asChild>
            <Link href={ROUTES.profile}>
              <User className="size-4" />
              My profile
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ callbackUrl: isAdmin ? ROUTES.adminLogin : ROUTES.login })}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
