const Blog = require("../models/Blog");
const { submitURL } = require("../utils/googleIndexing");

exports.getBlog = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOne({ slug });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found"
      });
    }

    // 🔥 SEO DATA
    const seo = {
      title: blog.title,
      description: blog.content.substring(0, 160),
    };

    // 🔗 Canonical URL
    const canonical = `https://rentalhub.com.ng/blog/${blog.slug}`;

    res.json({
      success: true,
      seo,
      canonical,
      data: blog
    });

  } catch (error) {
    console.error("Get blog error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch blog"
    });
  }
};
