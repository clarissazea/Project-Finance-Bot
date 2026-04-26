#!/usr/bin/env python3
"""
Python gRPC Finance Backend Server
Listens on localhost:50051
"""

import grpc
from concurrent import futures
import time
import uuid
from datetime import datetime
import finance_pb2
import finance_pb2_grpc


class FinanceServicer(finance_pb2_grpc.FinanceServiceServicer):
    """Implementation of FinanceService"""

    def __init__(self):
        # Simulated database
        self.transactions = {
            "user1": [
                {
                    "id": "tx001",
                    "type": "income",
                    "amount": 5000000,
                    "category": "salary",
                    "timestamp": "2026-04-01T09:00:00Z"
                },
                {
                    "id": "tx002",
                    "type": "expense",
                    "amount": 500000,
                    "category": "food",
                    "timestamp": "2026-04-02T12:30:00Z"
                },
                {
                    "id": "tx003",
                    "type": "expense",
                    "amount": 1000000,
                    "category": "transport",
                    "timestamp": "2026-04-03T08:15:00Z"
                }
            ],
            "aya": [
                {
                    "id": "tx004",
                    "type": "income",
                    "amount": 3000000,
                    "category": "freelance",
                    "timestamp": "2026-04-10T10:00:00Z"
                },
                {
                    "id": "tx005",
                    "type": "expense",
                    "amount": 200000,
                    "category": "utilities",
                    "timestamp": "2026-04-11T14:30:00Z"
                }
            ]
        }

    def GetSummary(self, request, context):
        """Get income and expense summary for a user"""
        user_id = request.userId
        print(f"📊 [gRPC] GetSummary for userId={user_id}")

        if user_id not in self.transactions:
            context.set_details(f"User {user_id} not found")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return finance_pb2.GetSummaryResponse()

        transactions = self.transactions[user_id]
        total_income = sum(tx["amount"] for tx in transactions if tx["type"] == "income")
        total_expense = sum(tx["amount"] for tx in transactions if tx["type"] == "expense")

        print(f"   ✅ Income: Rp{total_income:,}, Expense: Rp{total_expense:,}")
        return finance_pb2.GetSummaryResponse(
            totalIncome=total_income,
            totalExpense=total_expense
        )

    def GetHistory(self, request, context):
        """Stream transaction history for a user"""
        user_id = request.userId
        print(f"📜 [gRPC] GetHistory stream for userId={user_id}")

        if user_id not in self.transactions:
            context.set_details(f"User {user_id} not found")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return

        transactions = self.transactions[user_id]
        print(f"   📤 Streaming {len(transactions)} transactions...")

        for idx, tx in enumerate(transactions):
            yield finance_pb2.Transaction(
                id=tx["id"],
                userId=user_id,
                type=tx["type"],
                amount=tx["amount"],
                category=tx["category"],
                timestamp=tx["timestamp"]
            )
            # Small delay to simulate network streaming
            if idx < len(transactions) - 1:
                time.sleep(0.1)

        print(f"   ✅ Stream completed")

    def AddTransaction(self, request, context):
        """Add a new transaction for a user"""
        user_id = request.userId
        tx_type = request.type
        amount = request.amount
        category = request.category

        print(f"➕ [gRPC] AddTransaction: userId={user_id}, type={tx_type}, amount=Rp{amount:,}, category={category}")

        # Initialize user if doesn't exist
        if user_id not in self.transactions:
            self.transactions[user_id] = []

        # Create transaction
        transaction = {
            "id": str(uuid.uuid4())[:8],
            "type": tx_type,
            "amount": amount,
            "category": category,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

        # Store transaction
        self.transactions[user_id].append(transaction)

        print(f"   ✅ Transaction saved with ID: {transaction['id']}")
        return finance_pb2.AddTransactionResponse(
            success=True,
            message=f"Transaction added successfully (ID: {transaction['id']})"
        )


def serve():
    """Start the gRPC server"""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    finance_pb2_grpc.add_FinanceServiceServicer_to_server(
        FinanceServicer(), server
    )
    server.add_insecure_port("[::]:50051")
    
    print("🚀 Finance gRPC Backend Server starting...")
    print("📍 Listening on localhost:50051")
    print("🔌 Service: finance.FinanceService")
    print()
    
    server.start()
    try:
        while True:
            time.sleep(86400)  # Sleep indefinitely
    except KeyboardInterrupt:
        print("\n\n⛔ Shutting down server...")
        server.stop(0)


if __name__ == "__main__":
    serve()
