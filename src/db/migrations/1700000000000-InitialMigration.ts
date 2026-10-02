import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class InitialMigration1700000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(new Table({
            name: "enrollments",
            columns: [
                { name: "id", type: "text", isPrimary: true },
                { name: "workflowId", type: "text" },
                { name: "contactId", type: "text" },
                { name: "currentStepId", type: "text", isNullable: true },
                { name: "status", type: "text" },
                { name: "waitUntil", type: process.env.DB_TYPE === 'postgres' ? "timestamp with time zone" : "datetime", isNullable: true },
                { name: "createdAt", type: process.env.DB_TYPE === 'postgres' ? "timestamp with time zone" : "datetime", default: process.env.DB_TYPE === 'postgres' ? "now()" : "CURRENT_TIMESTAMP" },
                { name: "updatedAt", type: process.env.DB_TYPE === 'postgres' ? "timestamp with time zone" : "datetime", default: process.env.DB_TYPE === 'postgres' ? "now()" : "CURRENT_TIMESTAMP" },
                { name: "context", type: "text" }
            ]
        }), true);

        await queryRunner.createTable(new Table({
            name: "execution_history",
            columns: [
                { name: "id", type: "text", isPrimary: true },
                { name: "enrollmentId", type: "text" },
                { name: "stepId", type: "text" },
                { name: "status", type: "text" },
                { name: "outcome", type: "text" },
                { name: "timestamp", type: process.env.DB_TYPE === 'postgres' ? "timestamp with time zone" : "datetime" }
            ]
        }), true);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("execution_history");
        await queryRunner.dropTable("enrollments");
    }
}
