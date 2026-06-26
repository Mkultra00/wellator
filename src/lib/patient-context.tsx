import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPatients } from "@/lib/data.functions";


export type Patient = {
  id: string;
  full_name: string;
  dob: string;
  preferred_language: string;
  accessibility_notes: string | null;
  persona_note: string | null;
};

type Ctx = {
  patient: Patient | null;
  patients: Patient[];
  setPatientId: (id: string) => void;
  isLoading: boolean;
};

const PatientContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "vcn.activePatientId";

export function PatientProvider({ children }: { children: ReactNode }) {
  const fetchPatients = useServerFn(listPatients);
  const { data, isLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await fetchPatients()) as Patient[],
  });


  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setActiveId(saved);
  }, []);

  useEffect(() => {
    if (!activeId && data && data.length > 0) setActiveId(data[0].id);
  }, [activeId, data]);

  const setPatientId = (id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  };

  const patient = (data ?? []).find((p) => p.id === activeId) ?? null;

  return (
    <PatientContext.Provider
      value={{ patient, patients: data ?? [], setPatientId, isLoading }}
    >
      {children}
    </PatientContext.Provider>
  );
}

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error("usePatient must be used inside <PatientProvider>");
  return ctx;
}
