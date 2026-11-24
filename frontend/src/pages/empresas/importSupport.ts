import type { MappingConfig, TargetField } from "@/types";

/** Ayudas del asistente de importación de empresas: sugerencia de mapeo y plantilla descargable. */

const plain = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();


const ALIASES: Record<string, string> = {
  nombre: "name",
  name: "name",
  empresa: "name",
  tipo: "type",
  type: "type",
  estado: "status",
  status: "status",
  matriz: "parent",
  cadena: "parent",
  "empresa matriz": "parent",
  parent: "parent",
  "tipo de documento": "documentType",
  "tipo documento": "documentType",
  documenttype: "documentType",
  documento: "documentNumber",
  "numero de documento": "documentNumber",
  "numero documento": "documentNumber",
  nit: "documentNumber",
  ruc: "documentNumber",
  documentnumber: "documentNumber",
  direccion: "address",
  address: "address",
  ciudad: "city",
  city: "city",
  region: "region",
  departamento: "region",
  provincia: "region",
  pais: "countryCode",
  country: "countryCode",
  countrycode: "countryCode",
  latitud: "lat",
  lat: "lat",
  longitud: "lng",
  lng: "lng",
  lon: "lng",
  "razon social": "legalName",
  "nombre legal": "legalName",
  sector: "industry",
  categoria: "industry",
  industria: "industry",
  tamano: "size",
  "tamano de la empresa": "size",
  "tamano de empresa": "size",
  size: "size",
  empleados: "employeeRange",
  "numero de empleados": "employeeRange",
  "rango de empleados": "employeeRange",
  employees: "employeeRange",
  telefono: "phone1",
  "telefono 1": "phone1",
  celular: "phone1",
  phone: "phone1",
  "telefono 2": "phone2",
  "telefono secundario": "phone2",
  "celular 2": "phone2",
  correo: "email",
  "correo electronico": "email",
  email: "email",
  "e mail": "email",
  "sitio web": "website",
  web: "website",
  website: "website",
  "pagina web": "website",
  "codigo postal": "postalCode",
  cp: "postalCode",
  horario: "openingHours",
  "horario de atencion": "openingHours",
  etiquetas: "tags",
  tags: "tags",
  notas: "notes",
  observaciones: "notes",
  notes: "notes",
};

/**
 * Sugiere a qué campo de empresa corresponde cada columna del archivo, por su
 * nombre (sin acentos ni mayúsculas). Una columna sin coincidencia no se mapea.
 * Un campo solo recibe columnas cuyo alias lo nombra, y las columnas se asignan
 * una sola vez salvo en campos que admiten varias.
 */
export function suggestMapping(headers: string[], targetFields: TargetField[]): MappingConfig {
  const known = new Map(targetFields.map((f) => [f.field, f]));
  const out: MappingConfig = {};
  for (const header of headers) {
    const field = ALIASES[plain(header)];
    const target = field ? known.get(field) : undefined;
    if (!target) continue;
    const current = out[field] ?? [];
    if (current.length === 0 || target.allowMultiple) out[field] = [...current, header];
  }
  return out;
}

export const TEMPLATE_CSV =
  "\uFEFF" +
  [
    "Nombre,Razón social,Tipo,Matriz,Sector,Tamaño,Empleados,Tipo de documento,Documento,Teléfono,Teléfono 2,Correo,Sitio web,Dirección,Código postal,Ciudad,Región,País,Latitud,Longitud,Horario,Etiquetas,Notas,Estado",
    "Supermercado La 14,Distribuidora La 14 S.A.S.,Cliente,,Supermercados,Grande,501 a 1.000,NIT,900123456,+57 602 555 1234,+57 300 111 2233,compras@la14.co,www.la14.co,Calle 5 # 10-20,760001,Cali,Valle del Cauca,CO,3.4516,-76.5320,Lunes a sábado 8:00 a 20:00,vip;cadena,Pedir cita con gerencia,Activa",
    "La 14 Sucursal Norte,,Establecimiento,Supermercado La 14,Supermercados,Mediana,51 a 200,,,+57 602 555 9876,,,,Av 6N # 25-10,760002,Cali,Valle del Cauca,CO,3.4750,-76.5250,,,,Activa",
  ].join("\r\n");
