const {
  findMatchingSepayTransaction,
  extractPaymentRef,
  amountsMatch,
} = require('../../utils/sepayMatchUtils');

describe('sepayMatchUtils', () => {
  const txs = [
    {
      id: 'tx-store-b',
      amount_in: 150000,
      transaction_content: 'Thanh toan IMS-ABCDEF cho hang B',
      account_number: '9876543210',
    },
    {
      id: 'tx-store-a',
      amount_in: 150000,
      transaction_content: 'IMS-ABCDEF',
      account_number: '1111222233',
    },
  ];

  it('matches by payment ref and amount without requiring env account', () => {
    const match = findMatchingSepayTransaction(txs, {
      paymentRef: 'IMS-ABCDEF',
      expectedAmount: 150000,
      preferredAccountNumbers: ['9876543210'],
    });
    expect(match?.id).toBe('tx-store-b');
  });

  it('still matches when incoming account differs from preferred (multi-store)', () => {
    const match = findMatchingSepayTransaction(txs, {
      paymentRef: 'IMS-ABCDEF',
      expectedAmount: 150000,
      preferredAccountNumbers: ['0000999888'],
    });
    expect(match).toBeTruthy();
    expect(match.id).toBe('tx-store-b');
  });

  it('extracts IMS ref from transfer content', () => {
    expect(extractPaymentRef('chuyen IMSABC123')).toBe('IMS-ABC123');
  });

  it('amountsMatch allows 1 VND tolerance', () => {
    expect(amountsMatch(100000, 100001)).toBe(true);
    expect(amountsMatch(100000, 100002)).toBe(false);
  });
});
