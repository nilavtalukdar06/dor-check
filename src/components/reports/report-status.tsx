import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_VARIANT, type ReportStatusName } from "@/lib/reports";

export function ReportStatusBadge({ status }: { status: ReportStatusName }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} data-status={status}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
