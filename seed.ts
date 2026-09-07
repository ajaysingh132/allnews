// utils/seed.ts — Initial database seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Categories ──────────────────────────────────────────
  const categories = [
    { nameHi: "राजनीति",           nameEn: "Politics",        slug: "politics",        sortOrder: 1 },
    { nameHi: "सरकार और नीति",     nameEn: "Government & Policy", slug: "government-policy", sortOrder: 2 },
    { nameHi: "भारत",              nameEn: "India",            slug: "india",            sortOrder: 3 },
    { nameHi: "विश्व",             nameEn: "World",            slug: "world",            sortOrder: 4 },
    { nameHi: "अर्थव्यवस्था",     nameEn: "Economy",          slug: "economy",          sortOrder: 5 },
    { nameHi: "समाज",              nameEn: "Society",          slug: "society",          sortOrder: 6 },
    { nameHi: "संस्कृति",         nameEn: "Culture",          slug: "culture",          sortOrder: 7 },
    { nameHi: "संविधान और कानून", nameEn: "Constitution & Law", slug: "constitution-law", sortOrder: 8 },
    { nameHi: "तथ्य-जाँच",       nameEn: "Fact Check",       slug: "fact-check",       sortOrder: 9 },
    { nameHi: "शोध",              nameEn: "Research",         slug: "research",         sortOrder: 10 },
    { nameHi: "विचार",            nameEn: "Opinion",          slug: "opinion",          sortOrder: 11 },
    { nameHi: "विश्लेषण",        nameEn: "Analysis",         slug: "analysis",         sortOrder: 12 },
    { nameHi: "संवाद",            nameEn: "Interview",        slug: "samvad",           sortOrder: 13 },
    { nameHi: "अध्यात्म",         nameEn: "Spirituality",    slug: "spirituality",      sortOrder: 14 },
    { nameHi: "ग्राउंड रिपोर्ट", nameEn: "Ground Report",   slug: "ground-report",     sortOrder: 15 },
    { nameHi: "DNT / बंजारा",     nameEn: "DNT Community",   slug: "dnt-banjara",       sortOrder: 16 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log(`✅ ${categories.length} categories seeded`);

  // ── Tags ────────────────────────────────────────────────
  const tags = [
    { nameHi: "चुनाव", nameEn: "Elections", slug: "elections" },
    { nameHi: "सुप्रीम कोर्ट", nameEn: "Supreme Court", slug: "supreme-court" },
    { nameHi: "संसद", nameEn: "Parliament", slug: "parliament" },
    { nameHi: "बजट", nameEn: "Budget", slug: "budget" },
    { nameHi: "RBI", nameEn: "RBI", slug: "rbi" },
    { nameHi: "DNT समुदाय", nameEn: "DNT Community", slug: "dnt-community" },
    { nameHi: "बंजारा", nameEn: "Banjara", slug: "banjara" },
    { nameHi: "मोदी सरकार", nameEn: "Modi Government", slug: "modi-government" },
    { nameHi: "विपक्ष", nameEn: "Opposition", slug: "opposition" },
    { nameHi: "AI", nameEn: "Artificial Intelligence", slug: "ai" },
    { nameHi: "GBSBFORYOU", nameEn: "GBSBFORYOU", slug: "gbsbforyou" },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
    });
  }
  console.log(`✅ ${tags.length} tags seeded`);

  // ── Admin user ───────────────────────────────────────────
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123456";
  const adminHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: "ajay@gbsbforyou.in" },
    update: {},
    create: {
      name: "अजय सिंह चौहान",
      email: "ajay@gbsbforyou.in",
      passwordHash: adminHash,
      role: "super_admin",
      bio: "संस्थापक और मुख्य संपादक, GBSBFORYOU Publications",
      isActive: true,
    },
  });
  console.log(`✅ Admin user: ${admin.email} (password: ${adminPassword})`);

  // ── Editor user ──────────────────────────────────────────
  const editorHash = await bcrypt.hash("Editor@123456", 12);
  await prisma.user.upsert({
    where: { email: "editor@gyanvarta.in" },
    update: {},
    create: {
      name: "संपादक",
      email: "editor@gyanvarta.in",
      passwordHash: editorHash,
      role: "editor",
      isActive: true,
    },
  });
  console.log("✅ Editor user seeded");

  // ── Social accounts (placeholders) ───────────────────────
  const socialAccounts = [
    { platform: "youtube" as const,          accountName: "ज्ञानवार्ता", username: "@gyanvarta" },
    { platform: "x_twitter" as const,        accountName: "ज्ञानवार्ता", username: "@gyanvarta" },
    { platform: "facebook" as const,         accountName: "ज्ञानवार्ता", username: "gyanvarta" },
    { platform: "instagram" as const,        accountName: "ज्ञानवार्ता", username: "@gyanvarta" },
    { platform: "telegram" as const,         accountName: "ज्ञानवार्ता", username: "@gyanvarta" },
    { platform: "whatsapp_channel" as const, accountName: "ज्ञानवार्ता", username: "gyanvarta" },
    { platform: "linkedin" as const,         accountName: "ज्ञानवार्ता", username: "gyanvarta" },
    { platform: "threads" as const,          accountName: "ज्ञानवार्ता", username: "@gyanvarta" },
  ];

  for (const sa of socialAccounts) {
    const existing = await prisma.socialAccount.findFirst({
      where: { platform: sa.platform },
    });
    if (!existing) {
      await prisma.socialAccount.create({ data: sa });
    }
  }
  console.log(`✅ ${socialAccounts.length} social accounts seeded`);

  // ── Sample article ────────────────────────────────────────
  const politicsCat = await prisma.category.findUnique({ where: { slug: "politics" } });
  if (politicsCat) {
    const existing = await prisma.article.findUnique({
      where: { slug: "gyanvarta-launch-2026" },
    });
    if (!existing) {
      const article = await prisma.article.create({
        data: {
          titleHi: "ज्ञानवार्ता का शुभारंभ: हिंदी पत्रकारिता में एक नया अध्याय",
          subtitle: "GBSBFORYOU Publications का डिजिटल समाचार विश्लेषण मंच अब उपलब्ध",
          summary: "ज्ञानवार्ता एक नया हिंदी समाचार विश्लेषण मंच है जो तथ्य, संदर्भ और गहन विश्लेषण पर केंद्रित है।",
          body: "<h2>परिचय</h2><p>ज्ञानवार्ता का शुभारंभ हिंदी पत्रकारिता में एक नए अध्याय की शुरुआत है।</p><h2>हमारा दृष्टिकोण</h2><p>व्यक्ति नहीं, विषय केंद्र में। आरोप नहीं, प्रमाण केंद्र में। शोर नहीं, समझ केंद्र में।</p>",
          slug: "gyanvarta-launch-2026",
          contentType: "article",
          status: "published",
          categoryId: politicsCat.id,
          publishedAt: new Date(),
          readingTimeMins: 5,
          isAiAssisted: false,
          seoTitle: "ज्ञानवार्ता लॉन्च — हिंदी समाचार विश्लेषण",
          seoDescription: "GBSBFORYOU Publications का हिंदी डिजिटल न्यूज़ प्लेटफॉर्म ज्ञानवार्ता का शुभारंभ।",
          createdBy: admin.id,
          updatedBy: admin.id,
          approvedBy: admin.id,
          approvedAt: new Date(),
          authors: { create: [{ userId: admin.id, role: "author" }] },
        },
      });
      console.log(`✅ Sample article: ${article.id}`);
    }
  }

  console.log("\n🎉 Database seeded successfully!");
  console.log("\n📋 Login credentials:");
  console.log(`   Super Admin: ajay@gbsbforyou.in / ${adminPassword}`);
  console.log("   Editor: editor@gyanvarta.in / Editor@123456");
  console.log("\n⚠️  Change passwords immediately in production!");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
