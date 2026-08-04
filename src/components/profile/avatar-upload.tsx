"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initialsOf } from "@/components/layout/user-menu";

const MAX_BYTES = 1_000_000;
const MAX_DIMENSION = 512;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type AvatarUploadProps = {
  name: string;
  value?: string;
  onChange: (dataUrl: string) => void;
};

/**
 * Client-side avatar picker. Images are downscaled and re-encoded in the
 * browser before being stored as a data URL, which keeps rows small and avoids
 * requiring an object-storage bucket for local development.
 */
export function AvatarUpload({ name, value, onChange }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Choose a PNG, JPEG, WebP or GIF image.");
      return;
    }

    setProcessing(true);

    try {
      const dataUrl = await downscaleToDataUrl(file);

      if (dataUrl.length > MAX_BYTES) {
        toast.error("That image is too large even after compression. Try a smaller one.");
        return;
      }

      onChange(dataUrl);
    } catch {
      toast.error("Could not read that image. Please try another file.");
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="ring-border size-20 ring-2">
        {value && <AvatarImage src={value} alt="Profile photo preview" />}
        <AvatarFallback className="text-xl">{initialsOf(name || "?")}</AvatarFallback>
      </Avatar>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={processing}
            onClick={() => inputRef.current?.click()}
          >
            {!processing && <Camera className="size-4" />}
            {value ? "Change photo" : "Upload photo"}
          </Button>

          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">PNG, JPEG, WebP or GIF. Optional.</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}

/** Draws the image onto a canvas capped at MAX_DIMENSION and re-encodes as WebP. */
function downscaleToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error("decode failed"));
      image.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("canvas unavailable"));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", 0.85));
      };

      image.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
