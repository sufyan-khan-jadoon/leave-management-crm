import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Staff screen used to live at /admin/employees. The screen never changed
  // name — the address did — so anyone holding a bookmark or an old link is sent
  // on rather than shown a 404 for a page that is still there.
  async redirects() {
    return [
      { source: "/admin/employees", destination: "/admin/staff", permanent: true },
      { source: "/admin/employees/:id", destination: "/admin/staff/:id", permanent: true },
    ];
  },
};

export default nextConfig;
