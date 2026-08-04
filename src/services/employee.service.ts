import { EmployeeStatus, Role } from "@prisma/client";

import { toUtcDay } from "@/lib/date";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  employeeRepository,
  normalizeEmail,
  type EmployeeDto,
  type EmployeeListFilters,
} from "@/repositories/employee.repository";
import { emailService } from "@/services/email/email.service";
import type { AdminEmployeeUpdateInput, ProfileSetupInput, ProfileUpdateInput } from "@/validations/employee.schema";

export const employeeService = {
  async byId(id: string): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(id);
    if (!employee) throw new NotFoundError("Employee not found.");
    return employee;
  },

  /** Completes the post-verification profile step. */
  async completeProfile(employeeId: string, input: ProfileSetupInput): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    const updated = await employeeRepository.update(employeeId, {
      phone: input.phone,
      department: input.department,
      position: input.position,
      joiningDate: toUtcDay(input.joiningDate),
      ...(input.profilePhoto ? { profilePhoto: input.profilePhoto } : {}),
    });

    await emailService.sendProfileUpdated(updated.email, updated.name, "you");
    return updated;
  },

  /** Self-service profile edit. */
  async updateOwnProfile(employeeId: string, input: ProfileUpdateInput): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    const updated = await employeeRepository.update(employeeId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.joiningDate !== undefined ? { joiningDate: toUtcDay(input.joiningDate) } : {}),
      ...(input.profilePhoto !== undefined ? { profilePhoto: input.profilePhoto || null } : {}),
    });

    await emailService.sendProfileUpdated(updated.email, updated.name, "you");
    return updated;
  },

  /** Admin edit — may change email and account status. */
  async adminUpdate(employeeId: string, input: AdminEmployeeUpdateInput): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    if (input.email && normalizeEmail(input.email) !== employee.email) {
      const clash = await employeeRepository.findByEmail(input.email);
      if (clash) throw new ConflictError("Another account already uses that email address.");
    }

    const statusChanged = input.status !== undefined && input.status !== employee.status;

    const updated = await employeeRepository.update(employeeId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.joiningDate !== undefined ? { joiningDate: toUtcDay(input.joiningDate) } : {}),
      ...(input.profilePhoto !== undefined ? { profilePhoto: input.profilePhoto || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });

    if (statusChanged) {
      await emailService.sendAccountStatusChanged(
        updated.email,
        updated.name,
        updated.status === EmployeeStatus.SUSPENDED,
      );
    } else {
      await emailService.sendProfileUpdated(updated.email, updated.name, "an administrator");
    }

    return updated;
  },

  async setStatus(employeeId: string, status: EmployeeStatus, actingAdminId: string): Promise<EmployeeDto> {
    if (employeeId === actingAdminId) {
      throw new ForbiddenError("You cannot change the status of your own account.");
    }

    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    if (employee.role === Role.ADMIN) {
      throw new ForbiddenError("Administrator accounts cannot be suspended.");
    }

    if (employee.status === status) {
      throw new ConflictError(`This account is already ${status.toLowerCase()}.`);
    }

    const updated = await employeeRepository.update(employeeId, { status });
    await emailService.sendAccountStatusChanged(
      updated.email,
      updated.name,
      status === EmployeeStatus.SUSPENDED,
    );

    return updated;
  },

  /** Deletes an employee and, by cascade, their leave and OTP history. */
  async remove(employeeId: string, actingAdminId: string): Promise<EmployeeDto> {
    if (employeeId === actingAdminId) {
      throw new ForbiddenError("You cannot delete your own account.");
    }

    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    if (employee.role === Role.ADMIN) {
      throw new ForbiddenError("Administrator accounts cannot be deleted from the dashboard.");
    }

    return employeeRepository.delete(employeeId);
  },

  list(filters: EmployeeListFilters) {
    return employeeRepository.list(filters);
  },

  departments() {
    return employeeRepository.distinctDepartments();
  },
};
