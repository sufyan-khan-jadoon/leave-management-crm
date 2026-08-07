import { ConflictError, NotFoundError } from "@/lib/errors";
import { jobRoleRepository } from "@/repositories/job-role.repository";

export const jobRoleService = {
  list() {
    return jobRoleRepository.list();
  },

  /**
   * Adds a title to the shared list.
   *
   * Matching is case-insensitive on the way in even though the column is a
   * plain unique index: the point of a curated list is that "Team Lead" and
   * "team lead" do not both end up in the dropdown.
   */
  async create(name: string) {
    const existing = await jobRoleRepository.list();
    const clash = existing.find((role) => role.name.toLowerCase() === name.toLowerCase());

    if (clash) throw new ConflictError(`"${clash.name}" is already on the list.`);

    return jobRoleRepository.create(name);
  },

  /**
   * Removes a title from the list.
   *
   * People already holding it keep it — `position` is a copy of the name taken
   * at sign-up, not a reference — and invitations that pointed at it simply
   * stop carrying a title. Deleting is about what can be chosen next, not about
   * rewriting history.
   */
  async remove(id: string) {
    const role = await jobRoleRepository.findById(id);
    if (!role) throw new NotFoundError("That job role no longer exists.");

    return jobRoleRepository.delete(id);
  },

  /** Resolves a chosen id to a title, refusing one that has since been deleted. */
  async nameFor(id: string): Promise<string> {
    const role = await jobRoleRepository.findById(id);
    if (!role) throw new NotFoundError("That job role no longer exists. Pick another.");

    return role.name;
  },
};
