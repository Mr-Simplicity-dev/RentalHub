const COPY = {
  rent_savings_due_reminder: {
    en: {title:'Rent-Savings Contribution Due Reminder',message:'Your rent-savings contribution is due soon. Open your savings plan in RentalHub for details.'},
    ha: {title:'Tunatarwar ajiyar haya',message:'Lokacin biyan kuɗin ajiyar haya ya kusa. Buɗe tsarin ajiyarka a RentalHub don ganin bayanai.'},
    ig: {title:'Ncheta ego nchekwa ụlọ',message:'Oge ịkwụ ego nchekwa ụlọ gị eruola nso. Mepee atụmatụ nchekwa gị na RentalHub ka ị hụ nkọwa.'},
    yo: {title:'Ìránnilétí owó ìfipamọ́ ilé',message:'Àkókò láti san owó ìfipamọ́ ilé rẹ ti sún mọ́lé. Ṣí ètò ìfipamọ́ rẹ nínú RentalHub fún àlàyé.'},
  },
  rent_payment_success: {
    en: {title:'Rent Payment Successful',message:'Your rent payment was successful. You can view the receipt details in the app.'},
    ha: {title:'An biya kuɗin haya',message:'An karɓi kuɗin hayarka cikin nasara. Ka buɗe RentalHub don ganin rasit da cikakken bayani.'},
    ig: {title:'Ịkwụ ụgwọ ụlọ gara nke ọma',message:'A natara ụgwọ ụlọ gị nke ọma. Mepee RentalHub ka ị hụ risit na nkọwa.'},
    yo: {title:'Sísan owó ilé ti yọrí sí rere',message:'A ti gba owó ilé rẹ dáadáa. Ṣí RentalHub láti wo rísíìtì àti àlàyé.'},
  },
};
const getSpokenCopy = (eventType,language='en') => COPY[eventType]?.[language] || COPY[eventType]?.en || null;
module.exports={getSpokenCopy};
