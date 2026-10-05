import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, type User } from "../api";
import { useToast } from "../toast";
import { Card, Detail, Field, Page, RoleLabel, Section, Summary, field, messageOf, primary, secondary, useFieldErrors } from "./ui";

export function ProfilePage({
  token,
  user,
  onUser,
}: {
  token: string;
  user: User;
  onUser: (user: User) => void;
}) {
  const toast = useToast();
  const fields = useFieldErrors();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [photoUrl, setPhotoUrl] = useState(user.photo_url ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);

  useEffect(() => {
    setName(user.name);
    setPhotoUrl(user.photo_url ?? null);
  }, [user]);

  async function applyUser(next: User) {
    onUser(next);
    setPhotoUrl(next.photo_url ?? null);
  }

  return (
    <Page
      title="My profile"
      description="Update your name, password, and profile photo. Email and phone are managed by an administrator."
      crumbs={[{ label: "Account" }, { label: "My profile" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <Section index="1" title="Photo" />
          <div className="flex flex-wrap items-center gap-4">
            <ProfileAvatar name={name || user.name} photoUrl={photoUrl} size="lg" />
            <div className="space-y-2">
              <p className="text-sm text-muted-strong">JPEG, PNG, or WebP up to 2 MB.</p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setPhotoPending(true);
                    setError(null);
                    try {
                      const body = new FormData();
                      body.append("photo", file);
                      const next = await api<User>("/api/auth/me/photo", { method: "POST", body }, token);
                      await applyUser(next);
                      toast.success("Photo updated", "Your profile photo was saved.");
                    } catch (caught) {
                      const message = messageOf(caught);
                      setError(message);
                      toast.error("Couldn't upload photo", message);
                    } finally {
                      setPhotoPending(false);
                    }
                  }}
                />
                <button type="button" className={secondary} disabled={photoPending} onClick={() => fileInput.current?.click()}>
                  {photoPending ? "Uploading" : photoUrl ? "Change photo" : "Upload photo"}
                </button>
                {photoUrl ? (
                  <button
                    type="button"
                    className={secondary}
                    disabled={photoPending}
                    onClick={async () => {
                      setPhotoPending(true);
                      setError(null);
                      try {
                        const next = await api<User>("/api/auth/me/photo", { method: "DELETE" }, token);
                        await applyUser(next);
                        toast.success("Photo removed", "Your profile photo was cleared.");
                      } catch (caught) {
                        const message = messageOf(caught);
                        setError(message);
                        toast.error("Couldn't remove photo", message);
                      } finally {
                        setPhotoPending(false);
                      }
                    }}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <form
            className="mt-8"
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              const valid = fields.validateForm(event.currentTarget);
              const extras: Record<string, string> = {};
              if (password && !currentPassword) extras.current_password = "Enter your current password to set a new one.";
              if (password && password.length < 8) extras.password = "Use at least 8 characters.";
              if (Object.keys(extras).length) {
                fields.setErrors((current) => ({ ...current, ...extras }));
                return;
              }
              if (!valid) return;
              setPending(true);
              setError(null);
              try {
                const next = await api<User>("/api/auth/me", {
                  method: "PATCH",
                  body: JSON.stringify({
                    name,
                    ...(password ? { password, current_password: currentPassword } : {}),
                  }),
                }, token);
                setPassword("");
                setCurrentPassword("");
                fields.clearAll();
                await applyUser(next);
                toast.success("Profile updated", "Your account details were saved.");
              } catch (caught) {
                const message = messageOf(caught);
                const mapped = fields.applyServerMessage(message);
                setError(Object.keys(mapped).length ? null : message);
                toast.error("Couldn't save profile", message);
              } finally {
                setPending(false);
              }
            }}
          >
            <Section index="2" title="Personal information" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" error={fields.errorOf("name")}>
                <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} required />
              </Field>
            </div>
            <div className="mt-4">
              <Detail items={[
                { label: "Email", value: user.email },
                { label: "Phone", value: user.phone },
              ]} />
              <p className="mt-2 text-sm text-muted">Email and phone can only be changed by an administrator.</p>
            </div>
            <div className="mt-6"><Section index="3" title="Password" /></div>
            <p className="mb-3 text-sm text-muted-strong">Leave blank to keep your current password.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Current password" error={fields.errorOf("current_password")}>
                <input className={field} name="current_password" type="password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); fields.clearField("current_password"); }} placeholder="Required only when changing password" autoComplete="current-password" />
              </Field>
              <Field label="New password" error={fields.errorOf("password")}>
                <input className={field} name="password" type="password" value={password} onChange={(event) => { setPassword(event.target.value); fields.clearField("password"); }} placeholder="At least 8 characters" autoComplete="new-password" minLength={password ? 8 : undefined} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Link className={secondary} to="/">Cancel</Link>
              <button className={primary} disabled={pending}>{pending ? "Saving" : "Save profile"}</button>
            </div>
          </form>
        </Card>
        <Summary
          title={name || user.name}
          lines={[
            <ProfileAvatar name={name || user.name} photoUrl={photoUrl} size="md" />,
            user.email,
            <RoleLabel role={user.role} />,
            user.type,
          ]}
        />
      </div>
    </Page>
  );
}

export function ProfileAvatar({
  name,
  photoUrl,
  size = "sm",
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dimensions = size === "lg" ? "h-20 w-20 text-xl" : size === "md" ? "h-14 w-14 text-base" : "h-8 w-8 text-xs";
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${dimensions} rounded-full object-cover ring-1 ring-line-strong`}
      />
    );
  }
  return (
    <span className={`grid ${dimensions} place-items-center rounded-full bg-panel-strong font-bold text-blue`}>
      {initials(name)}
    </span>
  );
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}
