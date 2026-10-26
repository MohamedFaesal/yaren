export {
  procedureDetailErrors,
  procedureFields,
  procedureFormById,
  procedureForms,
  procedureServiceCharges,
  quantityForProcedureForm,
  readServices,
  readStaff,
  readText,
} from "./procedure-forms.js";
export type {
  ProcedureDetailValue,
  ProcedureDetails,
  ProcedureField,
  ProcedureFieldKind,
  ProcedureFormDefinition,
  ProcedureFormSection,
  ProcedureServiceValue,
  ProcedureStaffValue,
} from "./procedure-forms.js";

export class ApplicationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
