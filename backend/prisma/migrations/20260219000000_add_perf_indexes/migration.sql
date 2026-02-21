-- CreateIndex (Prisma default naming: Model_fieldName_idx)
CREATE INDEX "Employee_fullName_idx" ON "employees"("full_name");

-- CreateIndex
CREATE INDEX "Employee_departmentId_isActive_idx" ON "employees"("department_id", "is_active");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_status_startDate_endDate_idx" ON "leave_requests"("employee_id", "status", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "Absence_employeeId_date_idx" ON "absences"("employee_id", "date");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "holidays"("date");
