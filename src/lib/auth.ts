import { Employee, Owner } from './supabase';

const EMPLOYEE_KEY = 'dragon_auto_employee';
const OWNER_KEY = 'dragon_auto_owner';
const USER_TYPE_KEY = 'dragon_auto_user_type';

export type UserType = 'employee' | 'owner';

export function saveEmployee(employee: Employee): void {
  localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(employee));
  // Only set user type to employee if not already set to owner
  const currentUserType = localStorage.getItem(USER_TYPE_KEY);
  if (currentUserType !== 'owner') {
    localStorage.setItem(USER_TYPE_KEY, 'employee');
  }
}

export function getEmployee(): Employee | null {
  const data = localStorage.getItem(EMPLOYEE_KEY);
  return data ? JSON.parse(data) : null;
}

export function clearEmployee(): void {
  localStorage.removeItem(EMPLOYEE_KEY);
  localStorage.removeItem(USER_TYPE_KEY);
}

export function saveOwner(owner: Owner): void {
  localStorage.setItem(OWNER_KEY, JSON.stringify(owner));
  localStorage.setItem(USER_TYPE_KEY, 'owner');
}

export function getOwner(): Owner | null {
  const data = localStorage.getItem(OWNER_KEY);
  return data ? JSON.parse(data) : null;
}

export function clearOwner(): void {
  localStorage.removeItem(OWNER_KEY);
  localStorage.removeItem(USER_TYPE_KEY);
}

export function getUserType(): UserType | null {
  return localStorage.getItem(USER_TYPE_KEY) as UserType | null;
}

export function clearAllAuth(): void {
  clearEmployee();
  clearOwner();
}

