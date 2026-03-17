"use strict";
// scripts/updateWalletBalance.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWalletBalance = updateWalletBalance;
var drizzle_orm_1 = require("drizzle-orm");
var client_1 = require("../models/client");
var schema_1 = require("../schema/schema");
/**
 * Updates a user's wallet balance
 * @param userId - UUID of the user
 * @param amount - Amount to update (positive for credit, negative for debit)
 * @param reason - Reason for the transaction
 */
function updateWalletBalance(userId, amount, reason) {
    return __awaiter(this, void 0, void 0, function () {
        var wallet, newBalance;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, client_1.db.select().from(schema_1.wallets).where((0, drizzle_orm_1.eq)(schema_1.wallets.userId, userId))];
                case 1:
                    wallet = (_a.sent())[0];
                    if (!wallet)
                        throw new Error("Wallet not found for user ".concat(userId));
                    newBalance = Number(wallet.balance) + amount;
                    if (newBalance < 0)
                        throw new Error('Insufficient balance');
                    // Update balance
                    return [4 /*yield*/, client_1.db.update(schema_1.wallets).set({ balance: newBalance === null || newBalance === void 0 ? void 0 : newBalance.toString() }).where((0, drizzle_orm_1.eq)(schema_1.wallets.id, wallet.id))
                        // Insert transaction
                    ];
                case 2:
                    // Update balance
                    _a.sent();
                    // Insert transaction
                    return [4 /*yield*/, client_1.db.insert(schema_1.walletTransactions).values({
                            wallet_id: wallet.id,
                            amount: Math.abs(amount),
                            type: amount >= 0 ? 'credit' : 'debit',
                            reason: reason,
                            currency: wallet.currency,
                            created_at: new Date(),
                        })];
                case 3:
                    // Insert transaction
                    _a.sent();
                    console.log("\u2705 Wallet updated for user ".concat(userId, ". New balance: ").concat(newBalance.toFixed(2), " ").concat(wallet.currency));
                    return [2 /*return*/];
            }
        });
    });
}
// Example usage
if (require.main === module) {
    var _a = process.argv.slice(2), userId = _a[0], amountStr = _a[1], reason = _a[2];
    var amount = Number(amountStr);
    if (!userId || isNaN(amount) || !reason) {
        console.error('Usage: ts-node updateWalletBalance.ts <userId> <amount> <reason>');
        process.exit(1);
    }
    updateWalletBalance(userId, amount, reason)
        .then(function () { return process.exit(0); })
        .catch(function (err) {
        console.error(err);
        process.exit(1);
    });
}
