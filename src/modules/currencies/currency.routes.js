const express = require("express");
const router = express.Router();
const { protect, isAdmin } = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validation.middleware");
const Joi = require("joi");

const GenericController = require("../generic/generic.controller");

const controller = GenericController("Currency");

const createSchema = Joi.object({
  body: Joi.object({ code: Joi.string().uppercase().trim().min(3).required() }),
});
const updateSchema = Joi.object({
  body: Joi.object({ code: Joi.string().uppercase().trim().min(3).required() }),
});

// router.use(protect, isAdmin);

router.post("/", validate(createSchema), controller.create);
router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.patch("/:id", validate(updateSchema), controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
